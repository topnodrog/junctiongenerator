[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$GcloudPath,
  [Parameter(Mandatory=$true)][string]$Account,
  [Parameter(Mandatory=$true)][string]$Project,
  [Parameter(Mandatory=$true)][string]$ProjectNumber,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$WindowId,
  [string]$Region = 'us-central1'
)
$ErrorActionPreference = 'Stop'
$monitorToken = (& $GcloudPath auth print-access-token "--account=$Account").Trim()
if ($LASTEXITCODE -ne 0) { throw 'Google authentication failed' }
$monitorHeaders = @{ Authorization = "Bearer $monitorToken"; 'x-goog-user-project' = $Project }
function Invoke-MonitorApi([string]$Method, [string]$Uri, $Body = $null) {
  $params = @{Method=$Method; Uri=$Uri; Headers=$monitorHeaders; TimeoutSec=60}
  if ($null -ne $Body) { $params.ContentType='application/json'; $params.Body=($Body | ConvertTo-Json -Depth 30 -Compress) }
  Invoke-RestMethod @params
}
function Find-MonitorResource([string]$Uri) {
  try { Invoke-MonitorApi GET $Uri } catch {
    if ([int]$_.Exception.Response.StatusCode -ne 404) { throw }; return $null
  }
}
function Wait-MonitorOperation([string]$Base, $Operation) {
  for ($attempt=0; $attempt -lt 60; $attempt++) {
    if ($Operation.done) { if ($Operation.error) { throw ($Operation.error | ConvertTo-Json -Compress) }; return }
    Start-Sleep -Seconds 2
    $Operation = Invoke-MonitorApi GET "$Base/$($Operation.name)"
  }
  throw 'Google resource operation is still pending; inspect it before continuing'
}
function Add-MonitorBinding($Policy, [string]$Role, [string]$Member, $Condition=$null) {
  # Preserve the policy etag and every existing principal/condition.
  $found = @($Policy.bindings | Where-Object { $_.role -eq $Role -and ((!$Condition -and !$_.condition) -or ($Condition -and $_.condition.expression -eq $Condition.expression)) })
  if ($found.Count) { if ($found[0].members -notcontains $Member) { $found[0].members = @($found[0].members) + $Member } }
  else {
    $binding=@{role=$Role; members=@($Member)}
    if ($Condition) { $binding.condition=$Condition }
    $Policy.bindings = @($Policy.bindings) + $binding
  }
  $Policy.version=3
}

$services=@('run.googleapis.com','cloudscheduler.googleapis.com','cloudbuild.googleapis.com','artifactregistry.googleapis.com','aiplatform.googleapis.com','iamcredentials.googleapis.com','iam.googleapis.com','cloudresourcemanager.googleapis.com')
$enabled=Invoke-MonitorApi POST "https://serviceusage.googleapis.com/v1/projects/${ProjectNumber}/services:batchEnable" @{serviceIds=$services}
Wait-MonitorOperation 'https://serviceusage.googleapis.com/v1' $enabled
Write-Output 'Required monitor APIs enabled'

$runtime="jgc-monitor-runtime@${Project}.iam.gserviceaccount.com"
$build="jgc-monitor-build@${Project}.iam.gserviceaccount.com"
$scheduler="jgc-monitor-scheduler@${Project}.iam.gserviceaccount.com"
foreach ($id in @('jgc-monitor-runtime','jgc-monitor-build','jgc-monitor-scheduler')) {
  $uri="https://iam.googleapis.com/v1/projects/$Project/serviceAccounts/${id}@${Project}.iam.gserviceaccount.com"
  if (!(Find-MonitorResource $uri)) { Invoke-MonitorApi POST "https://iam.googleapis.com/v1/projects/$Project/serviceAccounts" @{accountId=$id; serviceAccount=@{displayName=$id}} | Out-Null }
}
$roles=@{
  jgcMonitorPredict=@('aiplatform.endpoints.predict','serviceusage.services.use');
  jgcMonitorSign=@('iam.serviceAccounts.signBlob');
  jgcMonitorStop=@('cloudscheduler.jobs.get','cloudscheduler.jobs.pause')
}
foreach ($id in $roles.Keys) {
  $uri="https://iam.googleapis.com/v1/projects/$Project/roles/$id"
  if (!(Find-MonitorResource $uri)) { Invoke-MonitorApi POST "https://iam.googleapis.com/v1/projects/$Project/roles" @{roleId=$id; role=@{title=$id; stage='GA'; includedPermissions=$roles[$id]}} | Out-Null }
}
$policy=Invoke-MonitorApi POST "https://cloudresourcemanager.googleapis.com/v1/projects/${Project}:getIamPolicy" @{options=@{requestedPolicyVersion=3}}
Add-MonitorBinding $policy "projects/$Project/roles/jgcMonitorPredict" "serviceAccount:$runtime"
# Scheduler does not expose per-job IAM policies. Restrict this role to pause/get;
# it cannot create, update, run or delete jobs and has no node permissions.
Add-MonitorBinding $policy "projects/$Project/roles/jgcMonitorStop" "serviceAccount:$runtime"
Add-MonitorBinding $policy 'roles/logging.logWriter' "serviceAccount:$build"
Add-MonitorBinding $policy 'roles/serviceusage.serviceUsageConsumer' "serviceAccount:$build"
Invoke-MonitorApi POST "https://cloudresourcemanager.googleapis.com/v1/projects/${Project}:setIamPolicy" @{policy=$policy} | Out-Null

$saUri="https://iam.googleapis.com/v1/projects/$Project/serviceAccounts/$runtime"
$saPolicy=Invoke-MonitorApi POST "${saUri}:getIamPolicy" @{}
if (!$saPolicy.PSObject.Properties['bindings']) { $saPolicy | Add-Member NoteProperty bindings @() }
if (!$saPolicy.PSObject.Properties['version']) { $saPolicy | Add-Member NoteProperty version 3 }
Add-MonitorBinding $saPolicy "projects/$Project/roles/jgcMonitorSign" "serviceAccount:$runtime"
Invoke-MonitorApi POST "${saUri}:setIamPolicy" @{policy=$saPolicy} | Out-Null

$evidence="jgc-soak-evidence-$ProjectNumber"
$source="jgc-monitor-build-$ProjectNumber"
foreach ($name in @($evidence,$source)) {
  $uri="https://storage.googleapis.com/storage/v1/b/$name"
  $existing=Find-MonitorResource $uri
  if (!$existing) { Invoke-MonitorApi POST "https://storage.googleapis.com/storage/v1/b?project=$Project" @{name=$name; location=$Region; iamConfiguration=@{uniformBucketLevelAccess=@{enabled=$true}; publicAccessPrevention='enforced'}} | Out-Null }
  elseif (!$existing.iamConfiguration.uniformBucketLevelAccess.enabled -or $existing.iamConfiguration.publicAccessPrevention -ne 'enforced') { throw 'Existing monitor bucket has unexpected access configuration' }
  $bucketPolicy=Invoke-MonitorApi GET "$uri/iam?optionsRequestedPolicyVersion=3"
  if ($name -eq $evidence) {
    Add-MonitorBinding $bucketPolicy 'roles/storage.objectViewer' "serviceAccount:$runtime"
    Add-MonitorBinding $bucketPolicy 'roles/storage.objectCreator' "serviceAccount:$runtime"
    $prefix="projects/_/buckets/$name/objects"
    Add-MonitorBinding $bucketPolicy 'roles/storage.objectUser' "serviceAccount:$runtime" @{title="mutable-$WindowId"; expression="resource.name.startsWith('$prefix/control/$WindowId/') || resource.name.startsWith('$prefix/incoming/$WindowId/')"}
  } else { Add-MonitorBinding $bucketPolicy 'roles/storage.objectViewer' "serviceAccount:$build" }
  Invoke-MonitorApi PUT "$uri/iam" $bucketPolicy | Out-Null
}
$repo="projects/$Project/locations/$Region/repositories/jgc-monitor"
$repoUri="https://artifactregistry.googleapis.com/v1/$repo"
if (!(Find-MonitorResource $repoUri)) {
  $op=Invoke-MonitorApi POST "https://artifactregistry.googleapis.com/v1/projects/$Project/locations/$Region/repositories?repositoryId=jgc-monitor" @{format='DOCKER'; description='JGC owner rehearsal monitor images'}
  Wait-MonitorOperation 'https://artifactregistry.googleapis.com/v1' $op
}
$repoPolicy=Invoke-MonitorApi GET "${repoUri}:getIamPolicy"
if (!$repoPolicy.PSObject.Properties['bindings']) { $repoPolicy | Add-Member NoteProperty bindings @() }
if (!$repoPolicy.PSObject.Properties['version']) { $repoPolicy | Add-Member NoteProperty version 3 }
Add-MonitorBinding $repoPolicy 'roles/artifactregistry.writer' "serviceAccount:$build"
Invoke-MonitorApi POST "${repoUri}:setIamPolicy" @{policy=$repoPolicy} | Out-Null
Write-Output "Private buckets, build repository and dedicated monitor identities prepared for $WindowId"

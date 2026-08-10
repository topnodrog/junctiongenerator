[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [string]$Zone = "us-central1-c",
  [string]$DnsName = "seed-a.junctiongenerator.net",
  [string]$FlySeedUrl = "wss://jgc-testnet-seed-b.fly.dev",
  [string]$RepositoryUrl = "https://github.com/topnodrog/junctiongenerator.git",
  [string]$RepositoryRef = "codex/google-cloud-readiness"
)

$ErrorActionPreference = "Stop"
$Region = $Zone -replace '-[a-z]$', ''
$Network = "jgc-seed"
$Subnet = "jgc-seed-$Region"
$Address = "jgc-seed-a-ip"
$DataDisk = "jgc-seed-a-data"
$SnapshotPolicy = "jgc-seed-a-daily"
$ServiceAccountName = "jgc-seed-a"
$Instance = "jgc-seed-a"
$StartupScript = Join-Path $PSScriptRoot "startup.sh"

if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
  throw "Google Cloud CLI (gcloud) is required."
}

$activeAccount = gcloud auth list --filter=status:ACTIVE --format="value(account)"
if (-not $activeAccount) {
  throw "No active Google Cloud CLI account. Run 'gcloud auth login' first."
}

gcloud config set project $ProjectId
gcloud services enable compute.googleapis.com

$networkExists = gcloud compute networks list --filter="name=($Network)" --format="value(name)"
if (-not $networkExists) {
  gcloud compute networks create $Network --subnet-mode=custom --mtu=1460
}

$subnetExists = gcloud compute networks subnets list --regions=$Region --filter="name=($Subnet)" --format="value(name)"
if (-not $subnetExists) {
  gcloud compute networks subnets create $Subnet --network=$Network --region=$Region --range=10.40.0.0/24
}

$tlsRule = "jgc-seed-public-tls"
if (-not (gcloud compute firewall-rules list --filter="name=($tlsRule)" --format="value(name)")) {
  gcloud compute firewall-rules create $tlsRule --network=$Network --direction=INGRESS --action=ALLOW --rules=tcp:443 --source-ranges=0.0.0.0/0 --target-tags=jgc-seed
}

$iapRule = "jgc-seed-iap-ssh"
if (-not (gcloud compute firewall-rules list --filter="name=($iapRule)" --format="value(name)")) {
  gcloud compute firewall-rules create $iapRule --network=$Network --direction=INGRESS --action=ALLOW --rules=tcp:22 --source-ranges=35.235.240.0/20 --target-tags=jgc-seed
}

if (-not (gcloud compute addresses list --regions=$Region --filter="name=($Address)" --format="value(name)")) {
  gcloud compute addresses create $Address --region=$Region --network-tier=PREMIUM
}
$ExternalAddress = gcloud compute addresses describe $Address --region=$Region --format="value(address)"

if (-not (gcloud compute disks list --zones=$Zone --filter="name=($DataDisk)" --format="value(name)")) {
  gcloud compute disks create $DataDisk --zone=$Zone --type=pd-standard --size=20GB
}

if (-not (gcloud compute resource-policies list --regions=$Region --filter="name=($SnapshotPolicy)" --format="value(name)")) {
  gcloud compute resource-policies create snapshot-schedule $SnapshotPolicy --region=$Region --daily-schedule --start-time=05:00 --max-retention-days=7 --on-source-disk-delete=keep-auto-snapshots --storage-location=$Region
}

$diskPolicies = gcloud compute disks describe $DataDisk --zone=$Zone --format="value(resourcePolicies)"
if ($diskPolicies -notmatch $SnapshotPolicy) {
  gcloud compute disks add-resource-policies $DataDisk --zone=$Zone --resource-policies=$SnapshotPolicy
}

$ServiceAccount = "$ServiceAccountName@$ProjectId.iam.gserviceaccount.com"
if (-not (gcloud iam service-accounts list --filter="email=($ServiceAccount)" --format="value(email)")) {
  gcloud iam service-accounts create $ServiceAccountName --display-name="JGC Seed A runtime"
}

$instanceExists = gcloud compute instances list --zones=$Zone --filter="name=($Instance)" --format="value(name)"
if (-not $instanceExists) {
  $metadata = "enable-oslogin=TRUE,jgc-repository-url=$RepositoryUrl,jgc-repository-ref=$RepositoryRef,jgc-advertise-host=$DnsName,jgc-seed-url=$FlySeedUrl"
  gcloud compute instances create $Instance `
    --zone=$Zone `
    --machine-type=e2-micro `
    --network-interface="subnet=$Subnet,address=$ExternalAddress,network-tier=PREMIUM" `
    --tags=jgc-seed `
    --service-account=$ServiceAccount `
    --no-scopes `
    --image-family=debian-12 `
    --image-project=debian-cloud `
    --boot-disk-type=pd-standard `
    --boot-disk-size=10GB `
    --disk="name=$DataDisk,device-name=jgc-seed-data,mode=rw,boot=no,auto-delete=no" `
    --metadata=$metadata `
    --metadata-from-file="startup-script=$StartupScript"
}

Write-Output "Google Seed A infrastructure is present."
Write-Output "Address: $ExternalAddress"
Write-Output "DNS required: $DnsName -> $ExternalAddress (proxied=false)"
Write-Output "Health after DNS propagation: https://$DnsName/healthz"
Write-Output "Startup logs: gcloud compute instances get-serial-port-output $Instance --zone=$Zone"

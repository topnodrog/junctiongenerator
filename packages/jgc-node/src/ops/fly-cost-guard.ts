export interface FlyCostGuardResult {
  pass: boolean;
  checks: Array<{ id: string; pass: boolean; detail: string }>;
}

interface FlyMachine {
  id?: unknown;
  state?: unknown;
  region?: unknown;
  config?: {
    guest?: { cpu_kind?: unknown; cpus?: unknown; memory_mb?: unknown };
    mounts?: Array<{ volume?: unknown }>;
    services?: Array<{ autostop?: unknown; min_machines_running?: unknown }>;
  };
}

interface FlyVolume {
  id?: unknown;
  size_gb?: unknown;
  region?: unknown;
  encrypted?: unknown;
  attached_machine_id?: unknown;
  snapshot_retention?: unknown;
  auto_backup_enabled?: unknown;
}

interface FlyIp {
  Type?: unknown;
  type?: unknown;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be a JSON array`);
  return value;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}

export function parseFlyJson(value: string, label: string): unknown[] {
  try {
    return array(JSON.parse(value), label);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function evaluateFlyCostGuard(
  rawMachines: unknown,
  rawVolumes: unknown,
  rawIps: unknown,
): FlyCostGuardResult {
  const machines = array(rawMachines, "machines") as FlyMachine[];
  const volumes = array(rawVolumes, "volumes") as FlyVolume[];
  const ips = array(rawIps, "IP addresses") as FlyIp[];
  const checks: FlyCostGuardResult["checks"] = [];
  const check = (id: string, pass: boolean, detail: string): void => {
    checks.push({ id, pass, detail });
  };

  check("machine-count", machines.length === 1, `expected 1 Machine; found ${machines.length}`);
  const machine = machines[0];
  const guest = record(machine?.config?.guest);
  const services = Array.isArray(machine?.config?.services) ? machine.config.services : [];
  check("machine-state", machine?.state === "started", `Machine state is ${String(machine?.state ?? "missing")}`);
  check("machine-region", machine?.region === "yyz", `Machine region is ${String(machine?.region ?? "missing")}`);
  check(
    "machine-size",
    guest.cpu_kind === "shared" && guest.cpus === 1 && guest.memory_mb === 512,
    `Machine shape is ${String(guest.cpu_kind ?? "missing")}/${String(guest.cpus ?? "missing")} CPU/${String(guest.memory_mb ?? "missing")} MB`,
  );
  check(
    "machine-autoscaling",
    services.length === 1 && services[0]?.autostop === false && services[0]?.min_machines_running === 1,
    "expected one always-on service with no autoscaling expansion",
  );

  check("volume-count", volumes.length === 1, `expected 1 volume; found ${volumes.length}`);
  const volume = volumes[0];
  check("volume-size", volume?.size_gb === 10, `volume size is ${String(volume?.size_gb ?? "missing")} GB`);
  check("volume-region", volume?.region === "yyz", `volume region is ${String(volume?.region ?? "missing")}`);
  check("volume-encryption", volume?.encrypted === true, "volume encryption must remain enabled");
  check(
    "volume-attachment",
    typeof volume?.attached_machine_id === "string" && volume.attached_machine_id === machine?.id,
    "volume must remain attached to the single expected Machine",
  );
  check("volume-backups", volume?.auto_backup_enabled === true, "automatic volume snapshots must remain enabled");
  check(
    "snapshot-retention",
    typeof volume?.snapshot_retention === "number" && volume.snapshot_retention <= 5,
    `snapshot retention is ${String(volume?.snapshot_retention ?? "missing")} day(s)`,
  );

  const ipTypes = ips.map(ip => String(ip.Type ?? ip.type ?? "missing"));
  const billableIps = ipTypes.filter(type => !["shared_v4", "v6"].includes(type));
  check(
    "billable-ip-addresses",
    billableIps.length === 0,
    billableIps.length === 0 ? "no dedicated or other billable IP address found" : `unexpected IP types: ${billableIps.join(", ")}`,
  );

  return { pass: checks.every(item => item.pass), checks };
}


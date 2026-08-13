import { evaluateFlyCostGuard, parseFlyJson } from "../ops/fly-cost-guard.js";

function healthyInventory() {
  return {
    machines: [{
      id: "machine-1",
      state: "started",
      region: "yyz",
      config: {
        guest: { cpu_kind: "shared", cpus: 1, memory_mb: 512 },
        services: [{ autostop: false, min_machines_running: 1 }],
      },
    }],
    volumes: [{
      id: "volume-1",
      size_gb: 10,
      region: "yyz",
      encrypted: true,
      attached_machine_id: "machine-1",
      snapshot_retention: 5,
      auto_backup_enabled: true,
    }],
    ips: [{ Type: "v6" }, { Type: "shared_v4" }],
  };
}

describe("Fly resource-cost guard", () => {
  test("passes the approved single-seed footprint", () => {
    const inventory = healthyInventory();
    expect(evaluateFlyCostGuard(inventory.machines, inventory.volumes, inventory.ips)).toEqual(
      expect.objectContaining({ pass: true }),
    );
  });

  test("fails on cost-bearing resource expansion", () => {
    const inventory = healthyInventory();
    inventory.machines.push({
      ...inventory.machines[0],
      id: "machine-2",
    });
    inventory.volumes[0].size_gb = 20;
    inventory.ips.push({ Type: "public_v4" });
    const result = evaluateFlyCostGuard(inventory.machines, inventory.volumes, inventory.ips);
    expect(result.pass).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "machine-count", pass: false }),
      expect.objectContaining({ id: "volume-size", pass: false }),
      expect.objectContaining({ id: "billable-ip-addresses", pass: false }),
    ]));
  });

  test("rejects malformed provider output", () => {
    expect(() => parseFlyJson("not-json", "machines")).toThrow("invalid JSON");
    expect(() => parseFlyJson("{}", "machines")).toThrow("JSON array");
  });
});


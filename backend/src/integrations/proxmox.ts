import { Agent } from "undici";
import { config } from "../config.js";

export interface ProxmoxResource {
  cpuPct: number;
  memUsed: number;
  memTotal: number;
  memPct: number;
  diskUsed: number;
  diskTotal: number;
  diskPct: number;
}

export interface ProxmoxVM {
  vmid: number;
  name: string;
  type: "qemu" | "lxc";
  status: "running" | "stopped";
  cpuPct: number;
  memPct: number;
}

export interface ProxmoxData {
  configured: boolean;
  node: string | null;
  resource: ProxmoxResource | null;
  vms: ProxmoxVM[];
}

// Proxmox использует self-signed cert — отключаем проверку TLS только для этих запросов.
const dispatcher = new Agent({ connect: { rejectUnauthorized: false } });

let cache: { data: ProxmoxData; at: number } | null = null;

async function pve<T>(path: string): Promise<T> {
  const res = await fetch(`${config.proxmox.url}/api2/json${path}`, {
    headers: { Authorization: `PVEAPIToken=${config.proxmox.token}` },
    dispatcher,
    signal: AbortSignal.timeout(10_000),
  } as RequestInit);
  if (!res.ok) throw new Error(`Proxmox responded ${res.status} for ${path}`);
  const json = (await res.json()) as { data: T };
  return json.data;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

interface NodeEntry {
  node: string;
  status: string;
}

interface NodeStatus {
  cpu: number;
  memory: { total: number; used: number };
  rootfs: { total: number; used: number };
}

interface GuestEntry {
  vmid: number;
  name?: string;
  status: string;
  cpu?: number;
  mem?: number;
  maxmem?: number;
}

export async function getProxmox(): Promise<ProxmoxData> {
  if (!config.proxmox.configured) {
    return { configured: false, node: null, resource: null, vms: [] };
  }

  if (cache && Date.now() - cache.at < config.poll.proxmox) return cache.data;

  // Определяем нод: явный из env либо первый online.
  let node = config.proxmox.node;
  if (!node) {
    const nodes = await pve<NodeEntry[]>("/nodes");
    node = (nodes.find((n) => n.status === "online") ?? nodes[0])?.node;
    if (!node) throw new Error("No Proxmox nodes found");
  }

  const status = await pve<NodeStatus>(`/nodes/${node}/status`);
  const resource: ProxmoxResource = {
    cpuPct: Math.round((status.cpu ?? 0) * 100),
    memUsed: status.memory.used,
    memTotal: status.memory.total,
    memPct: pct(status.memory.used, status.memory.total),
    diskUsed: status.rootfs.used,
    diskTotal: status.rootfs.total,
    diskPct: pct(status.rootfs.used, status.rootfs.total),
  };

  const [qemuRes, lxcRes] = await Promise.allSettled([
    pve<GuestEntry[]>(`/nodes/${node}/qemu`),
    pve<GuestEntry[]>(`/nodes/${node}/lxc`),
  ]);

  const toVM = (type: "qemu" | "lxc") => (g: GuestEntry): ProxmoxVM => ({
    vmid: g.vmid,
    name: g.name ?? String(g.vmid),
    type,
    status: g.status === "running" ? "running" : "stopped",
    cpuPct: Math.round((g.cpu ?? 0) * 100),
    memPct: pct(g.mem ?? 0, g.maxmem ?? 0),
  });

  const vms: ProxmoxVM[] = [
    ...(qemuRes.status === "fulfilled" ? qemuRes.value.map(toVM("qemu")) : []),
    ...(lxcRes.status === "fulfilled" ? lxcRes.value.map(toVM("lxc")) : []),
  ].sort((a, b) => {
    if (a.status !== b.status) return a.status === "running" ? -1 : 1;
    return a.vmid - b.vmid;
  });

  const data: ProxmoxData = { configured: true, node, resource, vms };
  cache = { data, at: Date.now() };
  return data;
}

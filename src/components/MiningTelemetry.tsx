"use client";

import React, { useState, useEffect, useRef } from "react";

interface Workload {
  id: string;
  task: string;
  miner: string;
  progress: number;
  status: "processing" | "verifying" | "completed" | "slashed";
  size: string;
}

const SAMPLE_TASKS = [
  { name: "Llama-3-8B Fine-Tuning Batch #14", size: "450 MB" },
  { name: "Stable Diffusion 3 Image Synthesis", size: "128 MB" },
  { name: "DeepSeek Coder Autocomplete Inference", size: "64 MB" },
  { name: "Whisper Speech-to-Text Processing", size: "320 MB" },
  { name: "ResNet-101 Image Feature Extraction", size: "180 MB" },
  { name: "BERT-Large Sentiment Token Aggregator", size: "96 MB" },
  { name: "ZK-Rollup Cryptographic Workload Proof", size: "48 MB" },
];

const SAMPLE_MINERS = [
  "0x89a...21c", "0xf4d...5a1", "0x3a2...b8e", "0x71c...e3a",
  "0x2be...9df", "0x51c...8aa", "0x6f3...712", "0xbc1...3ef"
];

export default function MiningTelemetry() {
  const [flops, setFlops] = useState(8.42);
  const [minersCount, setMinersCount] = useState(12842);
  const [blockHeight, setBlockHeight] = useState(389421);
  const [workloadsAllocation, setWorkloadsAllocation] = useState({
    internal: 84,
    external: 16
  });

  const [workloads, setWorkloads] = useState<Workload[]>([
    { id: "WL-9841", task: "Llama-3-8B Fine-Tuning Batch #14", miner: "0x89a...21c", progress: 42, status: "processing", size: "450 MB" },
    { id: "WL-9842", task: "Stable Diffusion 3 Image Synthesis", miner: "0xf4d...5a1", progress: 85, status: "processing", size: "128 MB" },
    { id: "WL-9843", task: "ZK-Rollup Cryptographic Workload Proof", miner: "0x3a2...b8e", progress: 15, status: "processing", size: "48 MB" }
  ]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredNode, setHoveredNode] = useState<{ id: number; name: string; flops: string; status: string } | null>(null);

  // Background random metrics updater
  useEffect(() => {
    const interval = setInterval(() => {
      setFlops((prev) => +(prev + (Math.random() - 0.5) * 0.05).toFixed(2));
      setMinersCount((prev) => prev + Math.floor((Math.random() - 0.48) * 3));
      
      if (Math.random() > 0.85) {
        setBlockHeight((prev) => prev + 1);
      }
      
      if (Math.random() > 0.9) {
        setWorkloadsAllocation(() => {
          const internal = Math.floor(80 + Math.random() * 8);
          return { internal, external: 100 - internal };
        });
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Workload Queue Simulation Logic
  useEffect(() => {
    const interval = setInterval(() => {
      setWorkloads((prevWorkloads) => {
        return prevWorkloads.map((wl) => {
          if (wl.status === "processing") {
            // Smooth progress: smaller increments (1-4%) at faster ticks
            const nextProgress = wl.progress + Math.floor(Math.random() * 4) + 1;
            if (nextProgress >= 100) {
              const isSlashed = Math.random() < 0.06;
              return {
                ...wl,
                progress: 100,
                status: isSlashed ? "slashed" : "verifying"
              };
            }
            return { ...wl, progress: nextProgress };
          }
          
          if (wl.status === "verifying") {
            return { ...wl, status: "completed" };
          }
          
          if (wl.status === "completed" || wl.status === "slashed") {
            const randomTask = SAMPLE_TASKS[Math.floor(Math.random() * SAMPLE_TASKS.length)];
            const randomMiner = SAMPLE_MINERS[Math.floor(Math.random() * SAMPLE_MINERS.length)];
            const newId = `WL-${Math.floor(Math.random() * 9000) + 1000}`;
            return {
              id: newId,
              task: randomTask.name,
              miner: randomMiner,
              progress: 0,
              status: "processing",
              size: randomTask.size
            };
          }
          
          return wl;
        });
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // HTML5 Canvas Network Grid Visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let width = canvas.width = canvas.offsetWidth;
    let height = canvas.height = canvas.offsetHeight;

    // Grid nodes configurations
    const nodes = [
      { id: 0, x: width * 0.5, y: height * 0.5, radius: 10, color: "var(--color-purple)", name: "C-Suite Orchestrator", flops: "Strategic Router", status: "Synchronized", pulse: 0 },
      { id: 1, x: width * 0.2, y: height * 0.25, radius: 6, color: "var(--color-cyan)", name: "Miner Node #02b", flops: "72.4 TFLOPS", status: "Verifying Proofs", pulse: 0.3 },
      { id: 2, x: width * 0.8, y: height * 0.25, radius: 6, color: "var(--color-cyan)", name: "Miner Node #51c", flops: "108.2 TFLOPS", status: "Fine-Tuning Llama", pulse: 0.6 },
      { id: 3, x: width * 0.15, y: height * 0.75, radius: 6, color: "var(--color-cyan)", name: "Miner Node #89a", flops: "48.1 TFLOPS", status: "Inference Processing", pulse: 0.1 },
      { id: 4, x: width * 0.55, y: height * 0.8, radius: 7, color: "var(--color-neon-green)", name: "Consensus Validator", flops: "On-Chain Spot Checker", status: "Spot Checking", pulse: 0.8 },
      { id: 5, x: width * 0.85, y: height * 0.7, radius: 8, color: "var(--color-magenta)", name: "Decentralized Marketplace Gateway", flops: "Routing External Bids", status: "Active Transactions", pulse: 0.4 }
    ];

    // Node connections
    const connections = [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
      { from: 0, to: 3 },
      { from: 0, to: 4 },
      { from: 0, to: 5 },
      { from: 1, to: 3 },
      { from: 2, to: 5 },
      { from: 4, to: 5 },
      { from: 3, to: 4 }
    ];

    // Data packets travelling along connections
    interface Packet {
      fromNode: number;
      toNode: number;
      progress: number;
      speed: number;
      color: string;
      size: number;
    }

    let packets: Packet[] = [];
    const maxPackets = 12;

    // Initialize packets
    for (let i = 0; i < maxPackets; i++) {
      const conn = connections[Math.floor(Math.random() * connections.length)];
      packets.push({
        fromNode: conn.from,
        toNode: conn.to,
        progress: Math.random(),
        speed: 0.005 + Math.random() * 0.008,
        color: Math.random() > 0.5 ? "var(--color-cyan)" : "var(--color-purple)",
        size: 2 + Math.random() * 2
      });
    }

    // Resize handler
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
      
      // Clear canvas immediately on resize to prevent ghosting
      ctx.clearRect(0, 0, width, height);
      
      // Update coordinates based on resized width/height
      nodes[0].x = width * 0.5; nodes[0].y = height * 0.5;
      nodes[1].x = width * 0.2; nodes[1].y = height * 0.25;
      nodes[2].x = width * 0.8; nodes[2].y = height * 0.25;
      nodes[3].x = width * 0.15; nodes[3].y = height * 0.75;
      nodes[4].x = width * 0.55; nodes[4].y = height * 0.8;
      nodes[5].x = width * 0.85; nodes[5].y = height * 0.7;
    };
    
    window.addEventListener("resize", handleResize);

    // Dynamic rendering loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw connection lines
      ctx.lineWidth = 1;
      connections.forEach((conn) => {
        const from = nodes[conn.from];
        const to = nodes[conn.to];
        ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });

      // 2. Animate and draw data packets
      packets.forEach((packet) => {
        packet.progress += packet.speed;
        if (packet.progress >= 1) {
          // Recycle packet to a new random connection
          const conn = connections[Math.floor(Math.random() * connections.length)];
          packet.fromNode = conn.from;
          packet.toNode = conn.to;
          packet.progress = 0;
          packet.speed = 0.005 + Math.random() * 0.008;
          packet.color = Math.random() > 0.5 ? "var(--color-cyan)" : "var(--color-purple)";
        }

        const from = nodes[packet.fromNode];
        const to = nodes[packet.toNode];

        // Linear interpolation
        const px = from.x + (to.x - from.x) * packet.progress;
        const py = from.y + (to.y - from.y) * packet.progress;

        // Draw packet glow
        const glowGrad = ctx.createRadialGradient(px, py, 0, px, py, packet.size * 3);
        glowGrad.addColorStop(0, packet.color === "var(--color-cyan)" ? "rgba(0, 242, 254, 0.4)" : "rgba(155, 81, 224, 0.4)");
        glowGrad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(px, py, packet.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw packet center core
        ctx.fillStyle = packet.color === "var(--color-cyan)" ? "#00f2fe" : "#9b51e0";
        ctx.beginPath();
        ctx.arc(px, py, packet.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // 3. Draw nodes
      nodes.forEach((node) => {
        node.pulse += 0.02;
        const pulseFactor = Math.sin(node.pulse) * 4;
        
        // Draw node pulse aura
        ctx.fillStyle = node.color === "var(--color-purple)" ? "rgba(155, 81, 224, 0.06)" : 
                        node.color === "var(--color-cyan)" ? "rgba(0, 242, 254, 0.05)" :
                        node.color === "var(--color-neon-green)" ? "rgba(57, 255, 20, 0.05)" : "rgba(243, 85, 136, 0.05)";
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6 + pulseFactor, 0, Math.PI * 2);
        ctx.fill();

        // Draw node border ring
        ctx.strokeStyle = node.color === "var(--color-purple)" ? "rgba(155, 81, 224, 0.3)" : 
                          node.color === "var(--color-cyan)" ? "rgba(0, 242, 254, 0.3)" :
                          node.color === "var(--color-neon-green)" ? "rgba(57, 255, 20, 0.3)" : "rgba(243, 85, 136, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 2, 0, Math.PI * 2);
        ctx.stroke();

        // Draw node core
        const coreGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
        coreGrad.addColorStop(0, "#fff");
        coreGrad.addColorStop(0.4, node.color === "var(--color-purple)" ? "#9b51e0" : 
                                 node.color === "var(--color-cyan)" ? "#00f2fe" :
                                 node.color === "var(--color-neon-green)" ? "#39ff14" : "#f35588");
        coreGrad.addColorStop(1, node.color === "var(--color-purple)" ? "#4c1d95" : 
                                 node.color === "var(--color-cyan)" ? "#0369a1" :
                                 node.color === "var(--color-neon-green)" ? "#15803d" : "#9d174d");
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    // Mouse movement handler for node tooltips
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let found: any = null;
      for (const node of nodes) {
        const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
        if (dist < 18) {
          found = {
            id: node.id,
            name: node.name,
            flops: node.flops,
            status: node.status
          };
          break;
        }
      }
      setHoveredNode(found);
    };

    canvas.addEventListener("mousemove", handleMouseMove);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
      if (canvas) {
        canvas.removeEventListener("mousemove", handleMouseMove);
      }
    };
  }, []);

  return (
    <div className="glass-container" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div>
        <h3 style={{ fontSize: "18px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ color: "var(--color-purple)" }}>⛏️</span> DNCG Proof-of-Useful-Compute Telemetry
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
          Real-time telemetry showing computational cycles harvested from the global $JGC GPU mining rig network and prioritized dynamically.
        </p>
      </div>

      {/* Hardware Telemetry Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Grid Computational Power</div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-cyan)", marginTop: "4px" }}>
            {flops} PFLOPS
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Active Mining Rigs</div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "#fff", marginTop: "4px" }}>
            {minersCount.toLocaleString()} Nodes
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Block Height (JGC)</div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-purple)", marginTop: "4px" }}>
            #{blockHeight.toLocaleString()}
          </div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.25)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Network Difficulty</div>
          <div style={{ fontSize: "20px", fontWeight: "800", color: "var(--color-magenta)", marginTop: "4px" }}>
            14.82 M
          </div>
        </div>
      </div>

      {/* Animated Compute Grid Visualizer */}
      <div style={{ position: "relative", height: "180px", background: "rgba(2,2,6,0.5)", border: "1px solid var(--glass-border)", borderRadius: "10px", overflow: "hidden" }}>
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
        
        {/* Visualizer instruction label */}
        <div style={{ position: "absolute", bottom: "8px", left: "10px", fontSize: "9px", color: "var(--text-muted)", pointerEvents: "none" }}>
          📡 Neural network topology viz. Hover over nodes to inspect hardware status.
        </div>

        {/* Node Hover Tooltip Card */}
        {hoveredNode && (
          <div style={{
            position: "absolute",
            top: "8px",
            right: "8px",
            background: "rgba(10,8,28,0.9)",
            border: "1px solid var(--color-cyan)",
            borderRadius: "6px",
            padding: "8px 12px",
            fontSize: "11px",
            width: "180px",
            boxShadow: "0 4px 20px rgba(0, 242, 254, 0.15)",
            zIndex: 20,
            backdropFilter: "blur(4px)",
            pointerEvents: "none",
            animation: "float 4s infinite alternate ease-in-out"
          }}>
            <div style={{ fontWeight: "700", color: "#fff", marginBottom: "4px" }}>{hoveredNode.name}</div>
            <div style={{ color: "var(--color-cyan)", fontSize: "10px", marginBottom: "2px" }}>{hoveredNode.flops}</div>
            <div style={{ color: "var(--text-secondary)", fontSize: "9px" }}>Status: <span style={{ color: "var(--color-neon-green)" }}>{hoveredNode.status}</span></div>
          </div>
        )}
      </div>

      {/* DNCG Allocation Progress Bar */}
      <div>
        <h4 style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", display: "flex", justifyContent: "space-between", letterSpacing: "0.02em" }}>
          <span>DNCG Compute Allocation Engine</span>
          <span style={{ color: "var(--color-cyan)" }}>Priority Enabled</span>
        </h4>
        
        <div style={{ display: "flex", height: "22px", borderRadius: "6px", overflow: "hidden", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div 
            style={{ 
              width: `${workloadsAllocation.internal}%`, 
              background: "linear-gradient(90deg, var(--color-purple), #7b2cbf)", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "10px", 
              fontWeight: "700",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            {workloadsAllocation.internal}% Internal AI
          </div>
          <div 
            style={{ 
              width: `${workloadsAllocation.external}%`, 
              background: "linear-gradient(90deg, var(--color-cyan), var(--color-blue))", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              fontSize: "10px", 
              fontWeight: "700",
              color: "#030209",
              transition: "width 0.8s cubic-bezier(0.16, 1, 0.3, 1)"
            }}
          >
            {workloadsAllocation.external}% Marketplace
          </div>
        </div>
      </div>

      {/* Live PoUC Workload Explorer Queue */}
      <div>
        <h4 style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px", letterSpacing: "0.02em" }}>
          Active PoUC AI Workload Queue
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {workloads.map((wl) => {
            let statusColor = "var(--color-cyan)";
            let statusText = "Processing";
            let bgLight = "rgba(0, 242, 254, 0.08)";
            let statusIcon = "⚙️";

            if (wl.status === "verifying") {
              statusColor = "var(--color-purple)";
              statusText = "Verifying Proof";
              bgLight = "rgba(155, 81, 224, 0.1)";
              statusIcon = "🛡️";
            } else if (wl.status === "completed") {
              statusColor = "var(--color-neon-green)";
              statusText = "Completed & Minted";
              bgLight = "rgba(57, 255, 20, 0.08)";
              statusIcon = "✅";
            } else if (wl.status === "slashed") {
              statusColor = "var(--color-magenta)";
              statusText = "Slashed (Fraud Detect)";
              bgLight = "rgba(243, 85, 136, 0.12)";
              statusIcon = "⚠️";
            }

            return (
              <div 
                key={wl.id} 
                style={{ 
                  background: "rgba(0,0,0,0.2)", 
                  border: wl.status === "slashed" ? "1px solid rgba(243, 85, 136, 0.2)" : "1px solid rgba(255,255,255,0.02)",
                  borderRadius: "8px", 
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  transition: "all 0.3s ease"
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px" }}>
                  <span style={{ fontWeight: "700", color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ color: "var(--text-muted)" }}>{wl.id}</span>
                    <span>{wl.task.slice(0, 28) + (wl.task.length > 28 ? "..." : "")}</span>
                  </span>
                  
                  <span style={{ 
                    fontSize: "9px", 
                    color: statusColor, 
                    background: bgLight, 
                    padding: "2px 6px", 
                    borderRadius: "4px", 
                    fontWeight: "600",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    <span>{statusIcon}</span>
                    <span>{statusText}</span>
                  </span>
                </div>

                {/* Progress bar or slash alert */}
                {wl.status === "slashed" ? (
                  <div style={{ fontSize: "9px", color: "var(--color-magenta)", fontStyle: "italic", background: "rgba(243,85,136,0.05)", padding: "4px 8px", borderRadius: "4px", borderLeft: "2px solid var(--color-magenta)" }}>
                    Spot Audit Failure: Miner rig returned invalid tensor matrix. Slashed -0.05 ETH stake.
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flexGrow: 1, height: "4px", background: "rgba(255,255,255,0.05)", borderRadius: "2px", overflow: "hidden" }}>
                      <div 
                        style={{ 
                          width: `${wl.progress}%`, 
                          height: "100%", 
                          background: wl.status === "completed" ? "var(--color-neon-green)" : 
                                      wl.status === "verifying" ? "var(--color-purple)" : "var(--color-cyan)", 
                          borderRadius: "2px",
                          transition: "width 0.4s ease"
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)", minWidth: "26px", textAlign: "right" }}>
                      {wl.progress}%
                    </span>
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "9px", color: "var(--text-muted)" }}>
                  <span>Worker GPU: <code style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{wl.miner}</code></span>
                  <span>Dataset: <span style={{ color: "var(--text-secondary)" }}>{wl.size}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

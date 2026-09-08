import { makeObject, type Project, type Point } from "./types";
function arc(cx: number, cy: number, inner: number, outer: number, a: number, b: number): Point[] {
  const points: Point[] = [], n = Math.max(12, Math.ceil((b - a) * outer / .8));
  for (let i = 0; i <= n; i++) { const t = a + (b - a) * i / n; points.push({ x: cx + Math.cos(t) * outer, y: cy + Math.sin(t) * outer }); }
  for (let i = n; i >= 0; i--) { const t = a + (b - a) * i / n; points.push({ x: cx + Math.cos(t) * inner, y: cy + Math.sin(t) * inner }); }
  return points;
}
export function createSample(kind: "arcs" | "sampler" = "arcs"): Project {
  const project: Project = { version: 1, name: kind === "arcs" ? "Arc study" : "Stitch sampler", width: 160, height: 160, fabric: "linen", hoopWidth: 200, hoopHeight: 200, objects: [], notes: [], source: "sample" };
  const colors = ["#21776a", "#cb8e48", "#c9604f", "#92a58a"];
  if (kind === "arcs") {
    for (let q = 0; q < 4; q++) for (let r = 0; r < 3; r++) {
      const start = q * Math.PI / 2 + .09, end = (q + 1) * Math.PI / 2 - .09;
      project.objects.push(makeObject({ id: `arc-${q}-${r}`, name: `${["Jade", "Ochre", "Terracotta", "Fern"][q]} ${r + 1}`, color: colors[q], paths: [arc(80, 80, 15 + r * 17, 28 + r * 17, start, end)], type: "tatami", angle: (25 + q * 45 + r * 15) % 180, pull: .18 }));
    }
    project.objects.push(makeObject({ id: "center", name: "Center diamond", color: "#cb8e48", paths: [[{x:80,y:70},{x:90,y:80},{x:80,y:90},{x:70,y:80}]], angle: 0 }));
    project.objects.push(makeObject({ id: "frame", name: "Satin frame", color: "#21776a", paths: [[{x:10,y:10},{x:150,y:10},{x:150,y:150},{x:10,y:150}], [{x:12.2,y:12.2},{x:147.8,y:12.2},{x:147.8,y:147.8},{x:12.2,y:147.8}]], type: "run", underlay: false, pull: 0, length: 2.2 }));
    project.objects[project.objects.length-1].name="Double run frame";
  } else {
    for (let i = 0; i < 4; i++) {
      const x = 18 + i * 32;
      project.objects.push(makeObject({ id:`fill-${i}`, name:`Tatami ${i*30}°`, color:colors[i], angle:i*30, paths:[[{x,y:20},{x:x+24,y:20},{x:x+24,y:90},{x,y:90}]] }));
      project.objects.push(makeObject({ id:`satin-${i}`,name:`Satin ${i+1}`,color:colors[i],type:"satin",angle:0,paths:[[{x:x+9,y:102},{x:x+15,y:102},{x:x+15,y:139},{x:x+9,y:139}]] }));
    }
  }
  return project;
}

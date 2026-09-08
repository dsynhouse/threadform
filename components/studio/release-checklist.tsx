"use client";
import type { Project, StitchPlan } from "@/lib/embroidery/types";
import { machinePreflight } from "@/lib/embroidery/machine-settings";
import { designFingerprint } from "@/lib/embroidery/operations";
export default function ReleaseChecklist({
  project,
  plan,
}: {
  project: Project;
  plan: StitchPlan | null;
}) {
  const errors = plan
    ? [...plan.issues, ...machinePreflight(project, plan)].filter(
        (i) => i.level === "error",
      )
    : [];
  const measured = (project.threadLibrary ?? []).filter(
    (t) => t.measuredLab,
  ).length;
  const qualified = project.sewOuts?.some(
    (r) =>
      r.designFingerprint === designFingerprint(project) &&
      r.result === "passed" &&
      r.fileSha256 &&
      r.controllerAccepted &&
      r.firmware &&
      r.operator &&
      r.evidenceURL,
  );
  const checks = [
    [
      "Design preflight",
      !plan ? "Pending" : errors.length ? "Needs revision" : "Pass",
      !plan
        ? "Generate stitches to run this check."
        : errors.length
          ? `${errors.length} export errors need attention.`
          : "No blocking geometry or configured-field errors for this design.",
    ],
    [
      "Native machine writers",
      "Implemented",
      "DST, PES v1, JEF v1 and EXP; 0.1 mm coordinates, palette mapping and bounded movements. Each machine model still needs qualification.",
    ],
    [
      "Specialty hardware",
      "Partial",
      "Pauses and single-sequin DST are implemented. Chenille, cording, lasers, beads and multi-sequin protocols need manufacturer specifications and test hardware.",
    ],
    [
      "Thread catalogue evidence",
      measured ? "Partial" : "Pending",
      `${measured} user-measured shades. PES/JEF screen palettes are included. Complete calibrated manufacturer catalogues require supplied datasets and physical approvals.`,
    ],
    [
      "Physical sew-out evidence",
      qualified ? "Recorded" : "Pending",
      qualified
        ? "User-supplied evidence matches the current design. Confirm the exported file hash and production setup."
        : "Record model, firmware, operator, file hash, measured size, controller acceptance and evidence for an actual sew-out.",
    ],
    [
      "Account backend",
      "Setup required",
      "Supabase integration and RLS migration are prepared. Configure the project, authentication email delivery, backups and live account tests before release.",
    ],
    [
      "Release operations",
      "Pending",
      "Supported-browser downloads, accessibility, load testing, backup restoration and independent security review must pass on the final deployment.",
    ],
  ];
  return (
    <section className="feature-card">
      <h2>Production readiness checklist</h2>
      <p className="help-text">
        This checklist records what is implemented and what evidence is still
        required. A software pass does not certify a machine or material.
      </p>
      <div className="release-checks">
        {checks.map(([title, status, detail]) => (
          <div className="release-check" key={title}>
            <div>
              <strong>{title}</strong>
              <p>{detail}</p>
            </div>
            <span className="badge">{status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

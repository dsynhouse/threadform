/// <reference lib="webworker" />
import { createApprovalPDF } from "./approval-pdf";
import { validateProject } from "./project";
self.onmessage = async (event) => {
  try {
    const [regular, bold] = await Promise.all(
      ["/fonts/DejaVuSans.ttf", "/fonts/DejaVuSans-Bold.ttf"].map(
        async (url) => {
          const response = await fetch(url);
          if (!response.ok)
            throw new Error("PDF fonts could not be loaded. Reload and retry.");
          return new Uint8Array(await response.arrayBuffer());
        },
      ),
    );
    const data = await createApprovalPDF(
      validateProject(event.data.project),
      event.data.plan,
      event.data.options,
      { regular, bold },
    );
    self.postMessage({ data }, [data.buffer]);
  } catch (error) {
    self.postMessage({
      error:
        error instanceof Error ? error.message : "Unable to create this PDF.",
    });
  }
};
export {};

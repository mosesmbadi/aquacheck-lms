"use client";

import { DashboardLayout } from "@/components/layout/DashboardLayout";

const sections = [
  {
    title: "1. Register a Sample",
    content: `Navigate to **Dashboard → Samples** and click the **"Register Sample"** button. Fill in the form with the following details:`,
    table: {
      headers: ["Field", "Required", "Example"],
      rows: [
<<<<<<< HEAD
        ["Contract", "No", "Select a contract or leave blank for standalone sample"],
=======
        ["Contract", "Yes", "Select an existing contract"],
>>>>>>> origin/main
        ["Sample Type", "Yes", "Water, Soil, Air"],
        ["Description", "No", "Borehole water sample"],
        ["Collection Date", "No", "2026-03-15"],
        ["Collection Location", "No", "Site A, Borehole 3"],
        ["GPS Coordinates", "No", "-1.2921, 36.8219"],
        ["Storage Condition", "No", "4°C, dark"],
      ],
    },
    notes: [
      "A unique sample code is generated automatically (e.g. AQ-2026-00001).",
      "A QR barcode is created for the sample — view it by clicking the QR icon in the samples table.",
      "The chain of custody is initialized with a 'Sample received' entry.",
<<<<<<< HEAD
      "Standalone samples can be registered without a contract, but they cannot proceed to testing until linked to one.",
=======
>>>>>>> origin/main
      "Every action is recorded in the audit trail.",
    ],
  },
  {
    title: "2. Add Test Results to a Sample",
    content: `Navigate to **Dashboard → Test Results** and click the **"New Test"** button. Fill in the form:`,
    table: {
      headers: ["Field", "Required", "Example"],
      rows: [
        ["Sample", "Yes", "Select sample by code (e.g. AQ-2026-00001)"],
        ["Method", "Yes", "Select a test method (e.g. SM 4500-H+ — pH Measurement)"],
        ["Result Value", "No (can add later)", "7.2"],
        ["Result Unit", "No", "mg/L, NTU"],
        ["Notes", "No", "Free text observations"],
      ],
    },
    notes: [],
  },
  {
    title: "3. Test Result Lifecycle",
    content: `Each test result follows a status workflow:`,
    steps: [
      { status: "Pending", description: "Test created but not yet started." },
      { status: "In Progress", description: "Automatically set when the test is created." },
      { status: "Completed", description: "Automatically set when a result value is entered." },
      { status: "Validated", description: "An Admin or Quality Manager clicks 'Validate' to approve the result." },
    ],
    notes: [
      "Only users with the Admin or Quality Manager role can validate results.",
      "Measurement uncertainty can be calculated by providing replicate measurement values and a coverage factor.",
    ],
  },
  {
    title: "4. Overall Workflow Summary",
    content: "",
    steps: [
      { status: "Step 1", description: "Create a Contract (Dashboard → Contracts)." },
<<<<<<< HEAD
      { status: "Step 2", description: "Register samples either as standalone samples or against a contract (Dashboard → Samples)." },
      { status: "Step 3", description: "Link the sample to a contract before recording test results if testing is required." },
      { status: "Step 4", description: "Record and validate test results for each sample (Dashboard → Tests)." },
      { status: "Step 5", description: "Generate sample-based reports from validated results (Dashboard → Reports)." },
=======
      { status: "Step 2", description: "Register Samples against the contract (Dashboard → Samples)." },
      { status: "Step 3", description: "Record Test Results for each sample, selecting a method (Dashboard → Tests)." },
      { status: "Step 4", description: "Results are validated by a Quality Manager or Admin." },
      { status: "Step 5", description: "Generate Reports from validated results (Dashboard → Reports)." },
>>>>>>> origin/main
    ],
    notes: [],
  },
];

function renderMarkdown(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|"[^"]+?")/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-semibold text-gray-900">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith("\u201c") || part.startsWith('"')) {
      return (
        <span key={i} className="font-medium text-primary-600">
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function DocsPage() {
  return (
    <DashboardLayout title="Documentation">
      <div className="max-w-4xl space-y-10">
        {/* Intro */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2">AquaCheck LIMS — User Guide</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            This guide explains how to register samples, record test results, and navigate the
            validation workflow in the AquaCheck Laboratory Information Management System.
          </p>
        </div>

        {sections.map((section) => (
          <div
            key={section.title}
            className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4"
          >
            <h3 className="text-base font-bold text-gray-900">{section.title}</h3>

            {section.content && (
              <p className="text-sm text-gray-600 leading-relaxed">
                {renderMarkdown(section.content)}
              </p>
            )}

            {/* Table */}
            {section.table && (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      {section.table.headers.map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-semibold text-gray-700 border-b border-gray-200"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row, ri) => (
                      <tr
                        key={ri}
                        className={ri % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-4 py-2 text-gray-600 border-b border-gray-100"
                          >
                            {ci === 1 ? (
                              <span
                                className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                                  cell === "Yes"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {cell}
                              </span>
                            ) : (
                              cell
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Steps */}
            {section.steps && (
              <div className="space-y-2">
                {section.steps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 mt-0.5 w-6 h-6 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <div className="text-sm text-gray-600">
                      <span className="font-semibold text-gray-800">{step.status}</span>
                      {" — "}
                      {renderMarkdown(step.description)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            {section.notes && section.notes.length > 0 && (
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">
                  Note
                </p>
                {section.notes.map((note, i) => (
                  <p key={i} className="text-sm text-blue-700 leading-relaxed">
                    • {renderMarkdown(note)}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardLayout>
  );
}

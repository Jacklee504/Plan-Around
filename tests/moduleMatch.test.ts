import { describe, expect, it } from "vitest";
import { findMatchingModule } from "../lib/moduleMatch";

const modules = [
  { id: "software", code: "CS401", name: "Advanced Software Engineering", credits: 5 },
  { id: "cloud", code: "CS402", name: "Cloud & Distributed Systems", credits: 5 },
];

describe("findMatchingModule", () => {
  it("matches an extracted module code despite presentation punctuation", () => {
    expect(findMatchingModule(modules, "CS-401", null)?.id).toBe("software");
  });

  it("falls back to an exact module-name match when the brief has no code", () => {
    expect(findMatchingModule(modules, null, "cloud and distributed systems")?.id).toBe("cloud");
  });

  it("does not choose a module when the extracted value is ambiguous", () => {
    const duplicateNameModules = [
      ...modules,
      { id: "software-2", code: "CS499", name: "Advanced Software Engineering", credits: 5 },
    ];

    expect(findMatchingModule(duplicateNameModules, null, "Advanced Software Engineering")).toBeNull();
  });
});

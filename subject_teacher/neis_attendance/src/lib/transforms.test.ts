import { describe, expect, it } from "vitest";
import {
  rostersFromTsv,
  rostersToTsv,
  settingsFromApi,
  settingsToApi,
  timetableRowsFromTsv,
  timetableRowsToTsv,
  toIsoDate,
  weekKeyFromIsoDate,
} from "./transforms";

describe("date helpers", () => {
  it("extracts an ISO date from mixed text", () => {
    expect(toIsoDate("run on 2026-04-22 please")).toBe("2026-04-22");
  });

  it("returns the Monday week key for an ISO date", () => {
    expect(weekKeyFromIsoDate("2026-04-22")).toBe("2026-04-20");
  });
});

describe("timetable TSV round-trip", () => {
  it("parses and re-serializes timetable rows", () => {
    const tsv = "slot_id\tday\tperiod\tgrade\tclass_no\tsubject_name\tneis_subject_label\nmon-3\tmon\t3\t2\t1\tLiterature\tLiterature";
    const rows = timetableRowsFromTsv(tsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.period).toBe(3);
    expect(timetableRowsToTsv(rows)).toContain("mon-3");
  });
});

describe("roster TSV round-trip", () => {
  it("parses and re-serializes roster rows", () => {
    const tsv = "class_key\tnumber\tname\n2-1\t3\tKim";
    const rosters = rostersFromTsv(tsv);
    expect(rosters["2-1"]?.[0]?.name).toBe("Kim");
    expect(rostersToTsv(rosters)).toContain("2-1\t3\tKim");
  });
});

describe("settings adapter", () => {
  it("maps api settings to UI and back", () => {
    const ui = settingsFromApi({
      teacherName: "Park",
      schoolName: "Seoul High",
      region: "경기",
      semester: { year: 2026, term: 1 },
    });
    expect(ui.teacherName).toBe("Park");
    const api = settingsToApi(ui);
    expect(api.schoolName).toBe("Seoul High");
  });
});

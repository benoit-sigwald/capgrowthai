import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { construireFiltre, resoudreSource } from "../lib/personnes.ts";

describe("resoudreSource", () => {
  it("inv: vers INVESTORS.CONTACTS", () => {
    const c = resoudreSource("inv:jane@acme.com")!;
    assert.equal(c.table, "INVESTORS.CONTACTS");
    assert.equal(c.cle, "CONTACT_ID");
    assert.equal(c.valeurCle, "jane@acme.com");
    assert.equal(c.colonnes.prenom, "FIRST_NAME");
    assert.equal(c.colonnes.societe, "ORG_NAME");
  });
  it("pro: vers PROSPECTS.CONTACTS, cle numerique, societe non modifiable", () => {
    const c = resoudreSource("pro:1234")!;
    assert.equal(c.table, "PROSPECTS.CONTACTS");
    assert.equal(c.valeurCle, 1234);
    assert.equal(c.colonnes.societe, undefined);
  });
  it("gate: resout le schema du site en majuscules", () => {
    const c = resoudreSource("gate:877:3")!;
    assert.equal(c.table, "GATE_877.PROSPECTS");
    assert.equal(c.valeurCle, 3);
  });
  it("gate: refuse un nom de site hors alphabet (garde injection)", () => {
    assert.equal(resoudreSource("gate:877;DROP:3"), null);
  });
  it("dir: non modifiable (le dirigeant vit dans ENTREPRISES)", () => {
    assert.equal(resoudreSource("dir:99"), null);
  });
});

describe("construireFiltre", () => {
  it("sans filtre : garde neutre", () => {
    const f = construireFiltre({});
    assert.equal(f.where, "1 = 1");
    assert.deepEqual(f.binds, {});
  });
  it("q cherche nom, societe, titre, e-mail — en bind, jamais en concat", () => {
    const f = construireFiltre({ q: "dupont" });
    assert.ok(f.where.includes("UPPER(FIRST_NAME"));
    assert.equal(f.binds.q, "%DUPONT%");
    assert.ok(!f.where.includes("dupont"));
  });
  it("canal joignable", () => {
    const f = construireFiltre({ canal: "joignable" });
    assert.ok(f.where.includes("EMAIL IS NOT NULL OR LINKEDIN_URL IS NOT NULL"));
  });
  it("source gate couvre les 35 schemas", () => {
    const f = construireFiltre({ source: "gate" });
    assert.ok(f.where.includes("SOURCE LIKE 'gate:%'"));
  });
});

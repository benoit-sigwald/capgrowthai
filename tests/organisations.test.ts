import { describe, it } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error module CommonJS du lot, sans types
import { normaliser } from "../batch/enrichir-organisations.js";

/*
 * La normalisation decide de TOUS les rapprochements : trop laxiste, elle
 * attribue a un prospect le LEI d'un homonyme a l'autre bout du monde. Ces cas
 * sont ceux qui ont reellement casse pendant l'ecriture.
 */
describe("normaliser", () => {
  it("retire la forme juridique, y compris pointee", () => {
    assert.equal(normaliser("ALTIS Capital SAS"), "altis capital");
    assert.equal(normaliser("Sequoia Capital, L.P."), "sequoia capital");
  });
  it("garde les mots distinctifs d'un fonds", () => {
    // Premier jet : « capital » etait traite comme un suffixe, et « Altis
    // Capital » devenait « altis ». Deux societes differentes fusionnaient.
    assert.notEqual(normaliser("Altis Capital"), normaliser("Altis"));
    assert.notEqual(normaliser("Index Ventures"), normaliser("Index"));
  });
  it("garde les noms courts tels quels", () => {
    assert.equal(normaliser("A15"), "a15");
    assert.equal(normaliser("ADQ"), "adq");
  });
  it("ignore accents et ponctuation", () => {
    assert.equal(normaliser("Société Générale"), "societe generale");
    assert.equal(normaliser("KKR & Co. Inc."), "kkr co");
  });
  it("ne vide jamais un nom entierement compose d'une forme juridique", () => {
    assert.equal(normaliser("SAS"), "sas");
  });
});

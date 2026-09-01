import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientAutorise, contactsAutorises, exigerAdmin, type Portee } from "../lib/portee.ts";

const admin: Portee = { uid: 1, role: "admin", clientIds: [] };
const membre: Portee = { uid: 2, role: "membre", clientIds: [1, 3] };
const client: Portee = { uid: 3, role: "client", clientIds: [2] };

describe("clientAutorise", () => {
  it("admin voit tous les mandats", () => assert.equal(clientAutorise(admin, 42), true));
  it("membre voit ses mandats affectes", () => {
    assert.equal(clientAutorise(membre, 1), true);
    assert.equal(clientAutorise(membre, 2), false);
  });
  it("client ne voit que le sien", () => {
    assert.equal(clientAutorise(client, 2), true);
    assert.equal(clientAutorise(client, 1), false);
  });
});

describe("contactsAutorises", () => {
  it("le referentiel est l'actif d'Arx : le role client n'y accede pas", () => {
    assert.equal(contactsAutorises(admin), true);
    assert.equal(contactsAutorises(membre), true);
    assert.equal(contactsAutorises(client), false);
  });
});

describe("exigerAdmin", () => {
  it("seul admin passe", () => {
    assert.equal(exigerAdmin(admin), true);
    assert.equal(exigerAdmin(membre), false);
  });
});

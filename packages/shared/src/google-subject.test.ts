import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isOpaqueAuthUserId,
  pickGoogleSubject,
  resolveStoredGoogleSub,
} from "./google-subject.js";

test("UUID NextAuth n'est pas un sujet Google", () => {
  assert.equal(
    isOpaqueAuthUserId("91f2eb0f-4af8-4f58-8e2c-33fc690140a5"),
    true
  );
  assert.equal(isOpaqueAuthUserId("108234567890123456789"), false);
});

test("pickGoogleSubject ignore l'UUID si un vrai sub est là", () => {
  assert.equal(
    pickGoogleSubject([
      "91f2eb0f-4af8-4f58-8e2c-33fc690140a5",
      "108234567890123456789",
    ]),
    "108234567890123456789"
  );
  assert.equal(
    pickGoogleSubject(["e1817f6b-9c32-410e-ba5d-55b8cc30079b"]),
    "e1817f6b-9c32-410e-ba5d-55b8cc30079b"
  );
});

test("resolveStoredGoogleSub garde le sub existant face à un UUID", () => {
  assert.equal(
    resolveStoredGoogleSub(
      "91f2eb0f-4af8-4f58-8e2c-33fc690140a5",
      "e1817f6b-9c32-410e-ba5d-55b8cc30079b"
    ),
    "91f2eb0f-4af8-4f58-8e2c-33fc690140a5"
  );
  assert.equal(
    resolveStoredGoogleSub(
      "91f2eb0f-4af8-4f58-8e2c-33fc690140a5",
      "108234567890123456789"
    ),
    "108234567890123456789"
  );
});

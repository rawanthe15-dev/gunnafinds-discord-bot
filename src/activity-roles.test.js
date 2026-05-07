import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  ACTIVITY_ROLES,
  ensureActivityRoles,
  guildSupportsRoleIcons,
  topActivityRoleName,
} from "./activity-roles.js";

test("activity role specs point at generated emblem assets", () => {
  assert.deepEqual(
    ACTIVITY_ROLES.map((role) => role.name),
    ["Active Finder", "Trusted Finder", "Gunna Elite"],
  );

  for (const role of ACTIVITY_ROLES) {
    assert.ok(role.iconPath.endsWith(".png"));
    assert.ok(existsSync(role.iconPath), `${role.name} emblem should exist`);
  }
});

test("topActivityRoleName resolves the highest earned rank", () => {
  assert.equal(topActivityRoleName({ score: 9 }), null);
  assert.equal(topActivityRoleName({ score: 10 }), "Active Finder");
  assert.equal(topActivityRoleName({ score: 40 }), "Trusted Finder");
  assert.equal(topActivityRoleName({ score: 120 }), "Gunna Elite");
});

test("guildSupportsRoleIcons checks the Discord role icon feature", () => {
  assert.equal(guildSupportsRoleIcons({ features: ["ROLE_ICONS"] }), true);
  assert.equal(guildSupportsRoleIcons({ features: [] }), false);
});

test("ensureActivityRoles updates existing role icons when supported", async () => {
  const iconUpdates = [];
  const report = [];
  const existingRoles = ACTIVITY_ROLES.map((roleSpec) => ({
    name: roleSpec.name,
    setIcon: async (iconPath, reason) => {
      iconUpdates.push({ role: roleSpec.name, iconPath, reason });
      return { name: roleSpec.name, iconPath };
    },
  }));
  const guild = {
    features: ["ROLE_ICONS"],
    roles: {
      fetch: async () => existingRoles,
      create: async () => {
        throw new Error("should not create existing roles");
      },
    },
  };

  await ensureActivityRoles(guild, {
    canManageRole: async () => true,
    logger: { warn() {} },
    report,
  });

  assert.equal(iconUpdates.length, ACTIVITY_ROLES.length);
  assert.deepEqual(
    iconUpdates.map((item) => item.role),
    ACTIVITY_ROLES.map((role) => role.name),
  );
  assert.ok(iconUpdates.every((item) => item.reason === "GunnaFinds activity role emblem"));
  assert.deepEqual(
    report.map((item) => item.iconStatus),
    ["updated", "updated", "updated"],
  );
});

test("ensureActivityRoles skips icon edits when guild lacks role icons", async () => {
  const iconUpdates = [];
  const report = [];
  const existingRoles = ACTIVITY_ROLES.map((roleSpec) => ({
    name: roleSpec.name,
    setIcon: async () => iconUpdates.push(roleSpec.name),
  }));
  const guild = {
    features: [],
    roles: {
      fetch: async () => existingRoles,
      create: async () => {
        throw new Error("should not create existing roles");
      },
    },
  };

  await ensureActivityRoles(guild, {
    canManageRole: async () => true,
    logger: { warn() {} },
    report,
  });

  assert.deepEqual(iconUpdates, []);
  assert.deepEqual(
    report.map((item) => item.iconStatus),
    ["unsupported", "unsupported", "unsupported"],
  );
  assert.match(report[0].detail, /role icons/i);
});

test("ensureActivityRoles reports permission blocks", async () => {
  const report = [];
  const existingRoles = ACTIVITY_ROLES.map((roleSpec) => ({
    name: roleSpec.name,
    setIcon: async () => {
      throw new Error("should not set icon without permission");
    },
  }));
  const guild = {
    features: ["ROLE_ICONS"],
    roles: {
      fetch: async () => existingRoles,
      create: async () => {
        throw new Error("should not create existing roles");
      },
    },
  };

  await ensureActivityRoles(guild, {
    canManageRole: async () => false,
    logger: { warn() {} },
    report,
  });

  assert.deepEqual(
    report.map((item) => item.iconStatus),
    ["permission-blocked", "permission-blocked", "permission-blocked"],
  );
});

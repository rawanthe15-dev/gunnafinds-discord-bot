import { fileURLToPath } from "node:url";

const ROLE_ICON_FEATURE = "ROLE_ICONS";
const ACTIVITY_ROLE_REASON = "GunnaFinds activity roles";
const ACTIVITY_ROLE_ICON_REASON = "GunnaFinds activity role emblem";

function rankEmblemPath(fileName) {
  return fileURLToPath(new URL(`../assets/discord/ranks/${fileName}`, import.meta.url));
}

export const ACTIVITY_ROLES = [
  {
    name: "Active Finder",
    score: 10,
    color: 0xf97316,
    iconPath: rankEmblemPath("active-finder.png"),
  },
  {
    name: "Trusted Finder",
    score: 35,
    color: 0x60a5fa,
    iconPath: rankEmblemPath("trusted-finder.png"),
  },
  {
    name: "Gunna Elite",
    score: 90,
    color: 0x16a34a,
    iconPath: rankEmblemPath("gunna-elite.png"),
  },
];

export function topActivityRoleName(activity, roles = ACTIVITY_ROLES) {
  const score = activity?.score ?? 0;
  return [...roles].reverse().find((role) => score >= role.score)?.name ?? null;
}

export function guildSupportsRoleIcons(guild) {
  return Array.isArray(guild?.features) && guild.features.includes(ROLE_ICON_FEATURE);
}

function reportRankSync(report, item) {
  report?.push(item);
}

async function syncActivityRoleIcon(guild, role, roleSpec, { canManageRole, logger, report, created }) {
  if (!roleSpec.iconPath) {
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "missing-asset",
      detail: "No emblem asset is configured for this rank.",
    });
    return role;
  }
  if (!guildSupportsRoleIcons(guild)) {
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "unsupported",
      detail: "This Discord server does not currently have the role icons feature.",
    });
    return role;
  }
  if (!(await canManageRole(guild, role))) {
    logger.warn(`Cannot set ${roleSpec.name} emblem. Give the bot Manage Roles and move its role above activity roles.`);
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "permission-blocked",
      detail: "The bot needs Manage Roles and its highest role above this rank.",
    });
    return role;
  }
  if (typeof role.setIcon !== "function") {
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "unsupported",
      detail: "This Discord.js role object cannot set role icons.",
    });
    return role;
  }

  return role.setIcon(roleSpec.iconPath, ACTIVITY_ROLE_ICON_REASON).catch((error) => {
    logger.warn(`Could not set ${roleSpec.name} emblem:`, error.message);
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "failed",
      detail: error.message,
    });
    return role;
  }).then((updatedRole) => {
    if (updatedRole === role && report?.some((item) => item.name === roleSpec.name)) return updatedRole;
    reportRankSync(report, {
      name: roleSpec.name,
      created,
      iconStatus: "updated",
      detail: "Emblem updated on the Discord role.",
    });
    return updatedRole;
  });
}

export async function ensureActivityRoles(
  guild,
  {
    roles = ACTIVITY_ROLES,
    canManageRole = async () => true,
    logger = console,
    report = null,
  } = {},
) {
  const fetchedRoles = await guild.roles.fetch();
  const ready = [];

  for (const roleSpec of roles) {
    let role = fetchedRoles.find((item) => item.name.toLowerCase() === roleSpec.name.toLowerCase());
    let created = false;
    if (!role) {
      role = await guild.roles.create({
        name: roleSpec.name,
        color: roleSpec.color,
        reason: ACTIVITY_ROLE_REASON,
      });
      created = true;
    }

    ready.push(await syncActivityRoleIcon(guild, role, roleSpec, { canManageRole, logger, report, created }));
  }

  return ready;
}

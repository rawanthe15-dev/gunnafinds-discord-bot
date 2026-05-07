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

async function syncActivityRoleIcon(guild, role, roleSpec, { canManageRole, logger }) {
  if (!roleSpec.iconPath) return role;
  if (!guildSupportsRoleIcons(guild)) return role;
  if (!(await canManageRole(guild, role))) {
    logger.warn(`Cannot set ${roleSpec.name} emblem. Give the bot Manage Roles and move its role above activity roles.`);
    return role;
  }
  if (typeof role.setIcon !== "function") return role;

  return role.setIcon(roleSpec.iconPath, ACTIVITY_ROLE_ICON_REASON).catch((error) => {
    logger.warn(`Could not set ${roleSpec.name} emblem:`, error.message);
    return role;
  });
}

export async function ensureActivityRoles(
  guild,
  {
    roles = ACTIVITY_ROLES,
    canManageRole = async () => true,
    logger = console,
  } = {},
) {
  const fetchedRoles = await guild.roles.fetch();
  const ready = [];

  for (const roleSpec of roles) {
    let role = fetchedRoles.find((item) => item.name.toLowerCase() === roleSpec.name.toLowerCase());
    if (!role) {
      role = await guild.roles.create({
        name: roleSpec.name,
        color: roleSpec.color,
        reason: ACTIVITY_ROLE_REASON,
      });
    }

    ready.push(await syncActivityRoleIcon(guild, role, roleSpec, { canManageRole, logger }));
  }

  return ready;
}

import type { SessionMeta, TreeNode, Provider } from "@/lib/types";
import { getProviderLabel, getProviderSortOrder } from "@/stores/providerSnapshots";

type ProviderGroup<T> = {
  provider: Provider;
  label: string;
  projectMap: Map<string, T>;
};

function providerGroupKey(provider: Provider, variantName?: string): string {
  if (provider !== "cc-mirror") {
    return provider;
  }
  return variantName ? `cc-mirror:${variantName}` : "cc-mirror";
}

function sortProviderGroups<T>(entries: [string, ProviderGroup<T>][]): [string, ProviderGroup<T>][] {
  return entries.sort(([, left], [, right]) => {
    const orderDiff = getProviderSortOrder(left.provider) - getProviderSortOrder(right.provider);
    if (orderDiff !== 0) {
      return orderDiff;
    }
    return left.label.localeCompare(right.label);
  });
}

export function buildFavoritesTree(sessions: SessionMeta[], noProjectLabel: string): TreeNode[] {
  const providerMap = new Map<string, ProviderGroup<{ label: string; sessions: SessionMeta[] }>>();

  for (const session of sessions) {
    const provider = session.provider || "claude";
    const key = providerGroupKey(provider, session.variant_name);
    const projectKey = session.project_path || "__no_project__";
    const projectLabel = session.project_name || noProjectLabel;

    if (!providerMap.has(key)) {
      providerMap.set(key, {
        provider,
        label: getProviderLabel(provider, session.variant_name),
        projectMap: new Map(),
      });
    }

    const projectMap = providerMap.get(key)!.projectMap;
    if (!projectMap.has(projectKey)) {
      projectMap.set(projectKey, { label: projectLabel, sessions: [] });
    }
    projectMap.get(projectKey)!.sessions.push(session);
  }

  const tree: TreeNode[] = [];
  for (const [providerKey, group] of sortProviderGroups([...providerMap.entries()])) {
    const projectNodes: TreeNode[] = [];
    for (const [projectKey, projectGroup] of group.projectMap) {
      const sessionNodes: TreeNode[] = projectGroup.sessions.map((session) => ({
        id: session.id,
        label: session.title,
        node_type: "session" as const,
        children: [],
        count: 0,
        provider: session.provider as Provider,
      }));
      projectNodes.push({
        id: `fav-${providerKey}-${projectKey}`,
        label: projectGroup.label,
        node_type: "project" as const,
        children: sessionNodes,
        count: sessionNodes.length,
        provider: null,
        project_path: projectKey === "__no_project__" ? undefined : projectKey,
      });
    }
    tree.push({
      id: `fav-${providerKey}`,
      label: group.label,
      node_type: "provider" as const,
      children: projectNodes,
      count: projectNodes.reduce((sum, node) => sum + node.count, 0),
      provider: group.provider,
    });
  }

  return tree;
}

import type { Asset, ReferenceNode, ImageNode } from '@open-industrial-design/design-model';
import {
  isValidMaterialKnowledge,
  type MaterialKnowledge,
  isValidResearchLibrary,
  type ResearchLibrary,
  type ResearchEntry,
  type Project,
} from '@open-industrial-design/design-model';
import { ActionError, type AppAction, type ActionIdFactory, type ActionClock } from './index';

export type ResearchCommand =
  | {
      kind: 'save-entry';
      id?: string;
      entry: Omit<ResearchEntry, 'id' | 'createdAt' | 'updatedAt'>;
    }
  | { kind: 'delete-entry'; id: string }
  | { kind: 'save-collection'; id?: string; name: string; entryIds: string[] }
  | { kind: 'delete-collection'; id: string };

export interface ResearchCommandInput {
  command: ResearchCommand;
  expected?: ResearchLibrary;
}

export function createImportResearchImageAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  {
    name: string;
    mimeType: string;
    size: number;
    width: number;
    height: number;
    collectionId?: string;
    expected?: ResearchLibrary;
  },
  { assetId: string; entryId: string },
  {
    blob: Blob;
    save(
      asset: Asset,
      blob: Blob,
      entry: ResearchEntry,
      collectionId: string | undefined,
      expected: ResearchLibrary | undefined,
    ): Promise<void>;
  }
> {
  return {
    descriptor: {
      id: 'workspace.importResearchImage',
      label: 'Import research image',
      description: 'Import a local image into research without creating a Canvas node.',
      kind: 'workspace',
    },
    validate(context, input) {
      return createImportImageAction().validate(context, { ...input, kind: 'image', x: 0, y: 0 });
    },
    async run(context, input, runtime) {
      if (
        !this.validate(context, input).ok ||
        runtime.blob.size !== input.size ||
        runtime.blob.type !== input.mimeType
      )
        throw new ActionError('validation', 'Invalid research image.');
      const timestamp = clock(),
        assetId = id(),
        entryId = id();
      const asset: Asset = {
        id: assetId,
        projectId: context.projectId,
        name: input.name.trim(),
        type: 'image',
        mimeType: input.mimeType,
        size: input.size,
        width: input.width,
        height: input.height,
        storage: { type: 'indexeddb', blobId: assetId },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const entry: ResearchEntry = {
        id: entryId,
        assetId,
        title: asset.name.slice(0, 200),
        notes: '',
        sourceUrl: '',
        tags: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runtime.save(asset, runtime.blob, entry, input.collectionId, input.expected);
      return { assetId, entryId };
    },
  };
}

/** Research operations never delete source Assets, Canvas nodes or analysis evidence. */
export function createResearchCommandAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  ResearchCommandInput,
  { id: string },
  {
    loadProject(id: string): Promise<Project | undefined>;
    loadAssets(projectId: string): Promise<Asset[]>;
    save(
      projectId: string,
      library: ResearchLibrary,
      expected: ResearchLibrary | undefined,
    ): Promise<void>;
  }
> {
  return {
    descriptor: {
      id: 'workspace.editResearch',
      label: 'Organize research',
      description: 'Edit user-curated research and collections without changing designs.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.projectId &&
          input?.command &&
          ['save-entry', 'delete-entry', 'save-collection', 'delete-collection'].includes(
            input.command.kind,
          ),
        ),
      };
    },
    async run(context, input, runtime) {
      if (!this.validate(context, input).ok)
        throw new ActionError('validation', 'Invalid research operation.');
      const project = await runtime.loadProject(context.projectId);
      if (!project || project.id !== context.projectId)
        throw new ActionError('validation', 'Research project is missing.');
      if (JSON.stringify(project.researchLibrary) !== JSON.stringify(input.expected))
        throw new ActionError('validation', 'Research changed. Reload before editing.');
      const expected = structuredClone(input.expected);
      const library = structuredClone(expected ?? { entries: [], collections: [] });
      const command = input.command;
      const timestamp = clock();
      const targetId = command.id ?? id();
      if (command.kind === 'save-entry') {
        const existing = library.entries.find((item) => item.id === targetId);
        if (!command.id && existing)
          throw new ActionError('validation', 'Research entry identity already exists.');
        if (command.id && !existing)
          throw new ActionError('validation', 'Research entry is missing.');
        const entry = {
          ...command.entry,
          id: targetId,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        if (existing)
          library.entries = library.entries.map((item) => (item.id === targetId ? entry : item));
        else library.entries.push(entry);
      } else if (command.kind === 'save-collection') {
        const existing = library.collections.find((item) => item.id === targetId);
        if (!command.id && existing)
          throw new ActionError('validation', 'Research collection identity already exists.');
        if (command.id && !existing)
          throw new ActionError('validation', 'Research collection is missing.');
        const collection = {
          id: targetId,
          name: command.name,
          entryIds: command.entryIds,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        };
        if (existing)
          library.collections = library.collections.map((item) =>
            item.id === targetId ? collection : item,
          );
        else library.collections.push(collection);
      } else if (command.kind === 'delete-entry') {
        if (!library.entries.some((item) => item.id === command.id))
          throw new ActionError('validation', 'Research entry is missing.');
        library.entries = library.entries.filter((item) => item.id !== command.id);
        library.collections = library.collections.map((item) =>
          item.entryIds.includes(command.id)
            ? {
                ...item,
                entryIds: item.entryIds.filter((entryId) => entryId !== command.id),
                updatedAt: timestamp,
              }
            : item,
        );
      } else {
        if (!library.collections.some((item) => item.id === command.id))
          throw new ActionError('validation', 'Research collection is missing.');
        library.collections = library.collections.filter((item) => item.id !== command.id);
      }
      if (
        !isValidResearchLibrary(
          library,
          await runtime.loadAssets(context.projectId),
          context.projectId,
        )
      )
        throw new ActionError('validation', 'Invalid research records.');
      await runtime.save(context.projectId, library, expected);
      return { id: targetId };
    },
  };
}

export function createImportImageAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  {
    name: string;
    kind: 'image' | 'reference';
    mimeType: string;
    size: number;
    width: number;
    height: number;
    x: number;
    y: number;
  },
  { asset: Asset; node: ImageNode | ReferenceNode },
  { blob: Blob; save(asset: Asset, node: ImageNode | ReferenceNode, blob: Blob): Promise<void> }
> {
  return {
    descriptor: {
      id: 'workspace.importImage',
      label: 'Import local image',
      description: 'Save a decoded image and independent card atomically.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.projectId &&
          context.boardId &&
          typeof input?.name === 'string' &&
          input.name.trim() &&
          input.name.length <= 500 &&
          ['image', 'reference'].includes(input.kind) &&
          ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(
            input.mimeType,
          ) &&
          Number.isInteger(input.size) &&
          input.size > 0 &&
          input.size <= 25 * 1024 * 1024 &&
          Number.isInteger(input.width) &&
          Number.isInteger(input.height) &&
          input.width > 0 &&
          input.height > 0 &&
          input.width * input.height <= 32_000_000 &&
          Number.isFinite(input.x) &&
          Number.isFinite(input.y),
        ),
      };
    },
    async run(context, input, runtime) {
      if (
        !this.validate(context, input).ok ||
        runtime.blob.size !== input.size ||
        runtime.blob.type !== input.mimeType
      )
        throw new ActionError('validation', 'Invalid image import.');
      const timestamp = clock(),
        assetId = id();
      const asset: Asset = {
        id: assetId,
        projectId: context.projectId,
        type: 'image',
        name: input.name.trim(),
        mimeType: input.mimeType,
        size: input.size,
        width: input.width,
        height: input.height,
        storage: { type: 'indexeddb', blobId: assetId },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const node: (ImageNode | ReferenceNode) & { label: string } = {
        id: id(),
        boardId: context.boardId,
        type: input.kind,
        assetId,
        ...(input.kind === 'reference' ? { referenceType: 'form' as const } : {}),
        label: asset.name,
        x: input.x,
        y: input.y,
        width: 280,
        height: Math.max(180, Math.min(400, (256 * input.height) / input.width + 68)),
        rotation: 0,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await runtime.save(asset, node, runtime.blob);
      return { asset, node };
    },
  };
}

export interface PlaceMaterialInput {
  assetId: string;
  name: string;
  x: number;
  y: number;
}
export interface PlaceMaterialResult {
  node: ReferenceNode;
  asset: Asset;
}
export function createSaveMaterialKnowledgeAction(): AppAction<
  { assetId: string; knowledge: MaterialKnowledge },
  { saved: boolean },
  { save(projectId: string, assetId: string, knowledge: MaterialKnowledge): Promise<void> }
> {
  return {
    descriptor: {
      id: 'workspace.saveMaterialKnowledge',
      label: 'Save material knowledge',
      description: 'Save local notes, tags and source attribution.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.projectId && input.assetId && isValidMaterialKnowledge(input.knowledge),
        ),
      };
    },
    async run(context, input, runtime) {
      if (!this.validate(context, input).ok)
        throw new ActionError('validation', 'Invalid material knowledge.');
      await runtime.save(context.projectId, input.assetId, input.knowledge);
      return { saved: true };
    },
  };
}
export function createPlaceMaterialAction(
  id: ActionIdFactory = () => crypto.randomUUID(),
  clock: ActionClock = () => Date.now(),
): AppAction<
  PlaceMaterialInput,
  PlaceMaterialResult,
  {
    place(projectId: string, assetId: string, node: ReferenceNode): Promise<PlaceMaterialResult>;
  }
> {
  return {
    descriptor: {
      id: 'workspace.placeMaterial',
      label: 'Place local material',
      description: 'Reuse a local image as an independent reference.',
      kind: 'workspace',
    },
    validate(context, input) {
      return {
        ok: Boolean(
          context.projectId &&
          context.boardId &&
          input.assetId &&
          typeof input.name === 'string' &&
          input.name.trim() &&
          input.name.length <= 500 &&
          Number.isFinite(input.x) &&
          Number.isFinite(input.y),
        ),
      };
    },
    async run(context, input, runtime) {
      if (!this.validate(context, input).ok)
        throw new ActionError('validation', 'Invalid material placement.');
      const timestamp = clock();
      const node: ReferenceNode & { label: string } = {
        id: id(),
        boardId: context.boardId,
        type: 'reference',
        assetId: input.assetId,
        label: input.name.trim(),
        referenceType: 'other',
        x: input.x,
        y: input.y,
        width: 280,
        height: 220,
        rotation: 0,
        zIndex: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      return runtime.place(context.projectId, input.assetId, node);
    },
  };
}

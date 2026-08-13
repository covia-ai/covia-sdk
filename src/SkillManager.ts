import { Asset } from './Asset';
import { AssetMetadata, WorkspaceListResult } from './types';

/** Agent behaviour optionally attached to otherwise ordinary asset metadata. */
export interface SkillFacet {
  tools?: readonly string[];
  context?: readonly unknown[];
}

/** Metadata view exposed when an asset is being used as a skill. */
export type SkillMetadata = AssetMetadata & {
  skill?: SkillFacet;
};

/** A skill is an ordinary Asset viewed with its optional skill metadata facet. */
export type Skill = Asset & {
  metadata: SkillMetadata;
};

interface SkillManagerVenue {
  workspace: {
    list(path?: string, limit?: number, offset?: number): Promise<WorkspaceListResult>;
  };
  assets: {
    get(path: string): Promise<Asset>;
  };
}

const PAGE_SIZE = 100;

/**
 * Thin, job-free convenience over workspace collections and ordinary assets.
 *
 * Skill discovery, precedence and search are application policy. This manager
 * only lists the asset objects at one location or gets the asset at one path.
 */
export class SkillManager {
  constructor(private venue: SkillManagerVenue) {}

  /** Return every skill asset directly contained at `path`. */
  async list(path: string): Promise<Skill[]> {
    const location = path.replace(/\/+$/, '');
    const skills: Skill[] = [];
    let offset = 0;

    for (;;) {
      const page = await this.venue.workspace.list(location, PAGE_SIZE, offset);
      if (!page.exists) return [];

      const keys = page.keys ?? [];
      const assets = await Promise.all(
        keys.map((key) => this.get(`${location}/${key}`)),
      );
      skills.push(...assets);

      const nextOffset = (page.offset ?? offset) + keys.length;
      if (keys.length === 0 || nextOffset >= (page.count ?? nextOffset)) break;
      offset = nextOffset;
    }

    return skills;
  }

  /** Return the ordinary asset at exactly `path`, with typed skill metadata. */
  async get(path: string): Promise<Skill> {
    return this.venue.assets.get(path);
  }
}

import { Asset } from './Asset';
import { AssetMetadata, CoviaError, WorkspaceListResult } from './types';

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

  /**
   * Return every skill asset directly contained at `path`. A single entry
   * that fails to resolve (e.g. a legacy bare-string alias the plain assets
   * endpoint can't follow — see covia-ai/frontend#229) is skipped rather
   * than failing the whole listing: one broken skill must not take down
   * every other skill at this location, the same "don't discard what was
   * already collected" principle this method already applies across pages.
   */
  async list(path: string): Promise<Skill[]> {
    const location = path.replace(/\/+$/, '');
    const skills: Skill[] = [];
    let offset = 0;

    for (;;) {
      const page = await this.venue.workspace.list(location, PAGE_SIZE, offset);
      // An absent location means "no skills" — but only on the first page.
      // Once entries have been collected, a vanishing page is a venue fault
      // and must not silently discard what was already listed.
      if (!page.exists) {
        if (skills.length === 0) return [];
        throw new CoviaError(`Skill listing at ${location} disappeared mid-listing`);
      }

      const keys = page.keys ?? [];
      const results = await Promise.allSettled(
        keys.map((key) => this.get(`${location}/${key}`)),
      );
      for (const result of results) {
        if (result.status === 'fulfilled') skills.push(result.value);
      }

      const nextOffset = (page.offset ?? offset) + keys.length;
      if (keys.length === 0 || nextOffset >= (page.count ?? nextOffset)) break;
      // A venue/proxy that ignores the offset param would otherwise loop
      // forever re-fetching the same page (cf. the JobManager guard).
      if (nextOffset <= offset) {
        throw new CoviaError('Venue returned a skills page that did not advance');
      }
      offset = nextOffset;
    }

    return skills;
  }

  /** Return the ordinary asset at exactly `path`, with typed skill metadata. */
  async get(path: string): Promise<Skill> {
    return this.venue.assets.get(path);
  }
}

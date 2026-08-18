import type { Asset } from '../Asset';
import { SkillManager } from '../SkillManager';
import { CoviaError } from '../types';

function asset(id: string, metadata: Record<string, unknown> = {}): Asset {
  return { id, metadata } as unknown as Asset;
}

function createVenue() {
  return {
    workspace: {
      list: jest.fn(),
    },
    assets: {
      get: jest.fn(),
    },
  };
}

describe('SkillManager', () => {
  it('lists the asset objects at one location and hides pagination', async () => {
    const venue = createVenue();
    venue.workspace.list
      .mockResolvedValueOnce({
        exists: true,
        type: 'Map',
        count: 3,
        offset: 0,
        keys: ['review', 'research'],
      })
      .mockResolvedValueOnce({
        exists: true,
        type: 'Map',
        count: 3,
        offset: 2,
        keys: ['write'],
      });
    venue.assets.get.mockImplementation((path: string) =>
      Promise.resolve(asset(path, { skill: { tools: [`${path}/tool`] } })),
    );

    const skills = await new SkillManager(venue).list('w/skills/');

    expect(venue.workspace.list.mock.calls).toEqual([
      ['w/skills', 100, 0],
      ['w/skills', 100, 2],
    ]);
    expect(venue.assets.get.mock.calls).toEqual([
      ['w/skills/review'],
      ['w/skills/research'],
      ['w/skills/write'],
    ]);
    expect(skills.map((skill) => skill.id)).toEqual([
      'w/skills/review',
      'w/skills/research',
      'w/skills/write',
    ]);
  });

  it('returns an empty list for an absent location', async () => {
    const venue = createVenue();
    venue.workspace.list.mockResolvedValue({ exists: false, type: 'Missing' });

    await expect(new SkillManager(venue).list('w/skills')).resolves.toEqual([]);
    expect(venue.assets.get).not.toHaveBeenCalled();
  });

  it('skips an entry that fails to resolve instead of failing the whole listing', async () => {
    // A legacy bare-string alias (or any other unreadable entry) 404s
    // through the plain assets endpoint — see covia-ai/frontend#229.
    const venue = createVenue();
    venue.workspace.list.mockResolvedValue({
      exists: true,
      type: 'Map',
      count: 3,
      offset: 0,
      keys: ['good-one', 'broken-alias', 'good-two'],
    });
    venue.assets.get.mockImplementation((path: string) =>
      path.includes('broken-alias')
        ? Promise.reject(new Error('Asset not found'))
        : Promise.resolve(asset(path)),
    );

    const skills = await new SkillManager(venue).list('w/skills');

    expect(skills.map((skill) => skill.id)).toEqual([
      'w/skills/good-one',
      'w/skills/good-two',
    ]);
  });

  it('throws when the venue returns a page that does not advance', async () => {
    // A venue/proxy that ignores the offset param must not loop forever.
    const venue = createVenue();
    venue.workspace.list.mockResolvedValue({
      exists: true,
      type: 'Map',
      count: 300,
      offset: 0,
      keys: ['a', 'b'],
    });
    venue.assets.get.mockImplementation((path: string) => Promise.resolve(asset(path)));

    await expect(new SkillManager(venue).list('w/skills')).rejects.toThrow(
      /did not advance/,
    );
  });

  it('throws when the listing vanishes mid-pagination instead of discarding collected skills', async () => {
    const venue = createVenue();
    venue.workspace.list
      .mockResolvedValueOnce({ exists: true, type: 'Map', count: 200, offset: 0, keys: ['a'] })
      .mockResolvedValueOnce({ exists: false, type: 'Missing' });
    venue.assets.get.mockImplementation((path: string) => Promise.resolve(asset(path)));

    await expect(new SkillManager(venue).list('w/skills')).rejects.toThrow(CoviaError);
  });

  it('gets exactly one asset without interpreting its metadata or content', async () => {
    const venue = createVenue();
    const original = asset('w/skills/review', {
      name: 'Review',
      content: { inline: '# Review' },
      skill: { tools: ['v/ops/test'], context: [{ ref: 'w/rules' }] },
    });
    venue.assets.get.mockResolvedValue(original);

    const skill = await new SkillManager(venue).get('w/skills/review');

    expect(venue.assets.get).toHaveBeenCalledWith('w/skills/review');
    expect(skill).toBe(original);
    expect(skill.metadata.skill?.tools).toEqual(['v/ops/test']);
  });
});

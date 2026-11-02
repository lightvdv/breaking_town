import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import { collectable, openPack, packs, rewardFor, type Collection } from '../src/ui/collection';

const starterOnly = (): Collection => ({ currency: 10_000, cards: Object.fromEntries(content.upgrades.filter((u) => u.starter).map((u) => [u.id, 1])), fresh: [] });

describe('collection (CONCEPT.md §3.5б)', () => {
  it('one run of the campaign with two stars a town buys the whole deck', () => {
    const run = (stars: number) =>
      content.towns.length * (['easy', 'normal', 'hard'] as const).reduce((sum, difficulty) => sum + rewardFor({ win: true, stars, difficulty, length: 'full', tutorial: false, campaign: true }), 0);
    const missing = collectable(content).filter((u) => !u.starter).length;
    const envelope = packs.find((p) => p.id === 'envelope')!;
    expect(run(2) + 60).toBeGreaterThanOrEqual(missing * envelope.cost);
    // A free game pays less than a campaign town.
    expect(rewardFor({ win: true, stars: 2, difficulty: 'normal', length: 'full', tutorial: false, campaign: false })).toBeLessThan(
      rewardFor({ win: true, stars: 2, difficulty: 'normal', length: 'full', tutorial: false, campaign: true }),
    );
  });

  it('the safe gives three new cards for less than three envelopes, and never a card already owned', () => {
    const safe = packs.find((p) => p.id === 'safe')!;
    const envelope = packs.find((p) => p.id === 'envelope')!;
    expect(safe.cost).toBeLessThan(3 * envelope.cost);
    const col = starterOnly();
    let seed = 1;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const got = openPack(col, content, safe, random);
    expect(got.cards).toHaveLength(3);
    expect(new Set(got.cards.map((x) => x.card.id)).size).toBe(3);
    for (const x of got.cards) expect(x.rarity).not.toBe('common');
    // With everything collected a pack only gives «связи» back.
    for (const u of collectable(content)) col.cards[u.id] = 1;
    const before = col.currency;
    const empty = openPack(col, content, safe, random);
    expect(empty.cards).toHaveLength(0);
    expect(col.currency).toBe(before - safe.cost + empty.refund);
    expect(empty.refund).toBeGreaterThan(0);
  });
});

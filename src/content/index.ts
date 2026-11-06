import type { Content } from '../sim/types';
import { applyOverlay, lang } from '../i18n';
import overlays from './en.json';
import arcs from './arcs.json';
import balance from './balance.json';
import buildings from './buildings.json';
import cards from './cards.json';
import channels from './channels.json';
import offers from './offers.json';
import letters from './letters.json';
import people from './people.json';
import difficulties from './difficulties.json';
import groups from './groups.json';
import reporters from './reporters.json';
import upgrades from './upgrades.json';
import forks from './forks.json';
import tasks from './tasks.json';
import twists from './twists.json';
import towns from './towns.json';
import townGen from './townGen.json';
import townCalibration from './townCalibration.json';
import lengths from './lengths.json';
import synergies from './synergies.json';
import cash from './cash.json';

// JSON imports are typed loosely (string instead of literal unions); validateContent checks the shape.
/** A content file in the current language (CONCEPT.md §7.5): the English overlay maps text paths to translations. */
export function localized<T>(name: string, data: T): T {
  return lang() === 'en' ? applyOverlay(data, (overlays as Record<string, Record<string, string>>)[name]) : data;
}

const raw = { arcs, balance, difficulties, buildings, cards, channels, groups, lengths, letters, synergies, cash, offers, people, reporters, tasks, towns, townGen, townCalibration, twists, upgrades, forks };
export const content = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, localized(k, v)])) as unknown as Content;

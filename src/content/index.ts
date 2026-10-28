import type { Content } from '../sim/types';
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
import lengths from './lengths.json';

// JSON imports are typed loosely (string instead of literal unions); validateContent checks the shape.
export const content = { arcs, balance, difficulties, buildings, cards, channels, groups, lengths, letters, offers, people, reporters, tasks, towns, twists, upgrades, forks } as unknown as Content;

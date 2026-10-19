import type { Content } from '../sim/types';
import arcs from './arcs.json';
import balance from './balance.json';
import buildings from './buildings.json';
import cards from './cards.json';
import channels from './channels.json';
import offers from './offers.json';
import groups from './groups.json';
import reporters from './reporters.json';
import upgrades from './upgrades.json';

// JSON imports are typed loosely (string instead of literal unions); validateContent checks the shape.
export const content = { arcs, balance, buildings, cards, channels, groups, offers, reporters, upgrades } as unknown as Content;

// Game content, checked once at startup. Edit the JSON files, not this file.
import bodies from '../content/bodies.json';
import economy from '../content/economy.json';
import upgrades from '../content/upgrades.json';
import { checkContent } from '../logic/content.ts';

export const content = checkContent(bodies, economy, upgrades);

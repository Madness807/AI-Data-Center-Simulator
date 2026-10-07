import { commandsChapter } from './commands';
import { contentChapters } from './content';
import type { GuideChapter } from './model';

/** Tous les chapitres du guide, dans l'ordre du sommaire ; les commandes ferment la marche. */
export const guideChapters = (): GuideChapter[] => [...contentChapters(), commandsChapter()];

// Site mascot only. Files marked MqyGalaxy represent the author's persona.
export const mascots = {
  smile: 'moeqyGirlsmile_noBackground.webp',
  thinking: 'moeqyGirlthinking_noBackground.webp',
  good: 'moeqyGirlGood_noBackground.webp',
  cat: 'moeqyGirlCat_noBackground.webp',
  cry: 'moeqyGirlcry_noBackground.webp',
} as const;
export type MascotMood = keyof typeof mascots;

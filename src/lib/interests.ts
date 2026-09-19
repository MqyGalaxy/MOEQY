import { mascots, type MascotMood } from './mascots';
export const interests = [
  { id: 'acgn', mood: 'cat', color: '#e65097', paper: '#fdeaf3', label: 'ACGN' },
  { id: 'video', mood: 'good', color: '#45b9c8', paper: '#e8f8f8', label: 'MEDIA' },
  { id: 'game', mood: 'smile', color: '#785978', paper: '#f0eaf4', label: 'GAME' },
  { id: 'more', mood: 'thinking', color: '#ed9ec2', paper: '#fff0f6', label: 'MORE' },
] as const satisfies readonly { id: string; mood: MascotMood; color: string; paper: string; label: string }[];
export const interestImage = (mood: MascotMood) => `/images/moeqyGirl/${mascots[mood]}`;

/** CIC catalogs used to seed the demo store (the live database is seeded by migration 007). */
import type { OffCoursePoolItem, OffCourseProposalModel } from '../types/domain';

type PoolSeed = [course: string, topic: string, sems: number[], mode: string, mark: string, lang: string, note?: string];

const POOL: PoolSeed[] = [
  ['Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-1]', [1], 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'],
  ['Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-2]', [2], 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'],
  ['Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-3]', [3], 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'],
  ['Basics of Spanish Language and Culture', 'BASICS OF SPANISH LANGUAGE AND CULTURE [BLOCK-4]', [4], 'Written', '50', 'Spanish', 'IGNOU SWAYAM BL-001'],
  ['English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-1]', [1], 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'],
  ['English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-2]', [2], 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'],
  ['English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-3]', [3], 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'],
  ['English in Daily Life', 'ENGLISH IN DAILY LIFE [BLOCK-4]', [4], 'Written', '50', 'English', 'IGNOU SWAYAM BEGLA-135'],
  ['Basics of Event Management', 'BASICS OF EVENT MANAGEMENT [PART-1]', [1, 3], 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-011'],
  ['Basics of Event Management', 'BASICS OF EVENT MANAGEMENT [PART-2]', [2, 4], 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-011'],
  ['Soft Skills', 'SOFT SKILLS [BLOCK-1,2]', [1, 3], 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-001'],
  ['Soft Skills', 'SOFT SKILLS [BLOCK-2,4]', [2, 4], 'Written', '50', 'Any Language', 'IGNOU SWAYAM BHC-001'],
  ["Principles of Qur'anic Recitation (Tajveed)", "PRINCIPLES OF QUR'ANIC RECITATION [TAJVEED]", [1], 'Written & Oral', 'Written 40, Oral 10', 'Any Language'],
  ['Japanese Language', 'JAPANESE LANGUAGE [PART-1]', [1], 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo L1-13'],
  ['Japanese Language', 'JAPANESE LANGUAGE [PART-2]', [2], 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo L14-25'],
  ['Japanese Language', 'JAPANESE LANGUAGE [PART-3]', [3], 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo II L26-37'],
  ['Japanese Language', 'JAPANESE LANGUAGE [PART-4]', [4], 'Written/Practical/Viva Voce', '50', 'Japanese', 'Minna no Nihongo II L38-50'],
];

export function seedPoolItems(now: string): OffCoursePoolItem[] {
  return POOL.map(([course_name, topic, semester_nos, exam_mode, mark, exam_language, note], i) => ({
    id: `pool-${i + 1}`,
    pool_year: '2026',
    course_name,
    topic,
    semester_nos,
    exam_mode,
    mark,
    exam_language,
    note: note || null,
    is_active: true,
    created_at: now,
  }));
}

export const PROPOSAL_MODELS: OffCourseProposalModel[] = [
  ['PRPS1', 'Advanced Level Web Design Front End Study', 'Practical', '100', 2],
  ['PRPS2', 'Advanced Animation Study', 'Practical', '100', 2],
  ['PRPS3', 'Advanced Graphic Design Study', 'Practical', '100', 2],
  ['PRPS4', 'Advanced MS Excel Study', 'Practical', '100', 2],
  ['PRPS5', 'Advanced MS Office Study', 'Practical', '100', 2],
  ['PRPS6', 'Advanced Study in Microsoft Word', 'Practical', '100', 1.5],
  ['PRPS7', 'Speech Designing', 'As per the manual', '100', 2],
  ['PRPS8', 'Video Editing Study', 'Practical', '100', 2],
  ['PRPS9', 'Thajweed', 'As per the manual', '50+50', 1.5],
  ['PRPS10', 'Modern Ideologies & Islamic Worldview (By SEM)', 'Written', '100', 3],
  ['PRPS11', 'Pedagogy Of Language Teaching and Moral Studies Education (SEM)', 'Written & Practical', '50+50', 3],
  ['PRPS12', 'Certificate Programme in Counselling Psychology (by SEM)', 'Written & Practical', '50+50', 3],
  ['PRPS13', 'Indian Polity Laxmikant Part 1-2', 'Written', '100', 2.5],
  ['PRPS14', 'Indian Polity Laxmikant Part 3-4', 'Written', '100', 2.5],
  ['PRPS15', 'Indian Polity Laxmikant Part 5-8', 'Written', '100', 2.5],
  ['PRPS16', 'AI Integrated Pedagogy', 'Viva & Practical', '100', 3],
].map(([code, title, exam_mode, mark, max_credit]) => ({
  code: code as string,
  title: title as string,
  exam_mode: exam_mode as string,
  mark: mark as string,
  max_credit: max_credit as number,
  is_active: true,
}));

// schema.org identity shared by every page: one Person (the author) and the
// foundation he is affiliated with, each with a stable @id, so search and
// answer engines tie every note, verse, video and article to the same person.

import { FOUNDATION, PROJECTS } from '../data/projects';
import { CHANNEL_URLS } from './data';
import { PRODUCTION_URL } from './site';

const origin = (site?: URL) => (site ?? new URL(PRODUCTION_URL)).origin;

export const personId = (site?: URL) => `${origin(site)}/#person`;
export const foundationId = (site?: URL) => `${origin(site)}/#imam-ali-foundation`;

/** Reference to the author, for `author`, `publisher`, `translator` … */
export const personRef = (site?: URL) => ({ '@type': 'Person', '@id': personId(site), name: 'Seyed Hamid Hosseini' });

export function personNode(site?: URL) {
  const o = origin(site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': personId(site),
    name: 'Seyed Hamid Hosseini',
    alternateName: ['سید حمید حسینی', 'Hamid Hosseini', 'السيد حميد حسيني', 'Seyed Hamid Hosseini'],
    honorificPrefix: 'Seyed',
    url: `${o}/fa/about/`,
    image: `${o}/og.png`,
    jobTitle: 'Islamic scholar and writer',
    description:
      'Muslim cleric and writer. Author of a reasoned Persian translation of the Quran with notes on every verse, and of the video series “Islam, why and how?” in Persian, Romanian, Arabic, Urdu and English.',
    knowsLanguage: ['fa', 'ar', 'ro', 'ur', 'en'],
    knowsAbout: ['Quran', 'Quran translation', 'Tafsir', 'Islamic ethics', 'Islamic theology', 'Hadith', 'Religion and reason'],
    birthDate: '1973',
    affiliation: [
      { '@id': foundationId(site) },
      { '@type': 'CollegeOrUniversity', name: 'University of Quran and Hadith', alternateName: 'دانشگاه قرآن و حدیث', url: 'https://qhu.ac.ir' },
    ],
    sameAs: [...new Set(Object.values(CHANNEL_URLS))],
  };
}

export function foundationNode(site?: URL) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': foundationId(site),
    name: FOUNDATION.name.ro,
    alternateName: [FOUNDATION.name.en, FOUNDATION.name.fa],
    url: FOUNDATION.url,
    address: { '@type': 'PostalAddress', addressLocality: 'Bucharest', addressCountry: 'RO' },
    subjectOf: PROJECTS.filter((p) => p !== FOUNDATION).map((p) => ({ '@type': 'WebSite', name: p.name.en, url: p.url })),
  };
}

# Quran morphology

`quran-morphology.txt` is an unmodified copy of
[mustafa0x/quran-morphology](https://github.com/mustafa0x/quran-morphology)
at commit `8f38b39016824284f9ed16ae15069ff9102c4acf`, a corrected fork of the
[Quranic Arabic Corpus](https://corpus.quran.com) morphology v0.4
(© Kais Dukes, GNU General Public License). Each line is one segment of a word:

    surah:ayah:word:segment <TAB> form <TAB> N|V|P <TAB> tags (ROOT:…|LEM:…|…)

It is read only by `scripts/quran/glossary.ts`, which uses the roots and lemmas
to place each word explained in the translation notes under its root. The file
is never shipped to the site. Keep it verbatim: to update, replace it with a
newer copy from the same source and note the commit here.

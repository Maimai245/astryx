---
'@astryxdesign/cli': patch
---

[experimental] `astryx discover` lists the icon sets your discover sources offer before your project sets `experimental.iconSet`, so an app can compare packs before it picks one. A pack shows in the Available list (`iconSets`), in a search, and on its `discover <package>/<set>` page, with the catalog's display name, description, license and icon count. When the catalog lists the set's definitions, the page's text says how many of the CLI's icon definitions it maps (`meanings: 38 of 52`); the JSON gains no field, and the definitions themselves stay behind the opt-in. The page gives the project's install command, then `astryx experimental icon use <set>`. Installed sets and `--type icon-set` still need the opt-in, and a catalog with no icon set gives the same output as before. Discover catalogs may give an icon set's `license`.

@josephfarina

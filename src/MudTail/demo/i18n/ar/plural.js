// Arabic counted nouns for pattern replacements: n + the right form of the noun.
//   count(3, { one: 'كتلة واحدة', two: 'كتلتان', few: '{n} كتل', many: '{n} كتلة', other: '{n} كتلة' }) → "3 كتل"
const rules = new Intl.PluralRules('ar');

export function count(n, forms) {
  const value = Number(n);
  const form = forms[rules.select(value)] ?? forms.other;
  return form.replace('{n}', String(n));
}

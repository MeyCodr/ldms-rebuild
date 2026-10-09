import Handlebars from "handlebars";

// LDMS's emails, as Handlebars templates. One layout (the navy LDMS band, a
// white card, a quiet footer) wraps every email, so they look alike.
//
// Written for Outlook, which lays email out with Word: tables for structure,
// every style inline, colours as bgcolor, no images (Outlook blocks them
// until asked), no flex or grid. Rounded corners are extras that Outlook
// drops without harm. Colours are the app's own (globals.css).
//
// Two things Outlook does that shape the markup:
// - It ignores padding on a link, so a button's padding is also given to its
//   cell for Outlook alone (mso-padding-alt).
// - It ignores margins on tables, so the gaps between blocks are spacer
//   blocks of a fixed height.
//
// Everything in {{ }} is escaped by Handlebars, so a name or a training
// title can't put HTML into an email. Pure: no database, no clock.

const hb = Handlebars.create();

const FONT = "font-family:'Segoe UI',Arial,Helvetica,sans-serif;";

hb.registerPartial(
  "layout",
  `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>{{title}}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F6F8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">{{preheader}}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F4F6F8" style="background-color:#F4F6F8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px;max-width:100%;">
<tr><td bgcolor="#17324D" style="background-color:#17324D;padding:20px 28px;border-radius:12px 12px 0 0;">
<div style="${FONT}font-size:22px;line-height:26px;font-weight:bold;color:#FFFFFF;letter-spacing:0.5px;">LDMS</div>
<div style="${FONT}font-size:12px;line-height:18px;color:#C9D6E2;">Learning and Development Management System &middot; PHN Industry</div>
</td></tr>
<tr><td bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:28px;border-left:1px solid #E2E7EC;border-right:1px solid #E2E7EC;border-bottom:1px solid #E2E7EC;border-radius:0 0 12px 12px;${FONT}font-size:14px;line-height:22px;color:#1A2633;">
{{> @partial-block}}
</td></tr>
<tr><td style="padding:16px 28px;${FONT}font-size:12px;line-height:18px;color:#6B7787;" align="center">
This is an auto-generated email, no reply is needed.<br>
Learning &amp; Development, PHN Industry Sdn Bhd
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
);

/**
 * The link as a button that Outlook draws too: a coloured cell with the link
 * inside it. Elsewhere the link carries the padding, so the whole button can
 * be clicked; Outlook ignores that, so there the cell carries it.
 */
hb.registerPartial(
  "button",
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="#167D7F" style="background-color:#167D7F;border-radius:6px;mso-padding-alt:10px 18px;">
<a href="{{href}}" style="display:inline-block;padding:10px 18px;mso-padding-alt:0;${FONT}font-size:13px;line-height:18px;font-weight:bold;color:#FFFFFF;text-decoration:none;"><span style="color:#FFFFFF;">{{label}}</span></a>
</td></tr></table>`,
);

/** A gap of a fixed height that every mail program keeps. */
const gap = (px: number) => `<div style="height:${px}px;line-height:${px}px;font-size:${px}px;mso-line-height-rule:exactly;">&nbsp;</div>`;

const GREETING = `<p style="margin:0 0 4px;font-style:italic;color:#6B7787;font-size:13px;">Assalamualaikum Warahmatullahi Wabarakatuh &amp; Salam Sejahtera,</p>
<p style="margin:0 0 20px;font-style:italic;color:#6B7787;font-size:13px;">Greetings from Learning &amp; Development, PHN Industry Sdn Bhd.</p>`;

const TEMPLATES = {
  /** The daily reminder: everything waiting on one person, kind by kind. */
  digest: `{{#> layout}}
${GREETING}
<p style="margin:0 0 12px;font-size:15px;">Dear <strong>{{name}}</strong>,</p>
<p style="margin:0;">{{summary}}</p>
{{#each sections}}
${gap(22)}
<div style="${FONT}font-size:15px;line-height:22px;font-weight:bold;color:#17324D;">{{heading}} <span style="font-weight:normal;color:#6B7787;">({{count}})</span></div>
${gap(8)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #E2E7EC;border-collapse:collapse;">
<tr>
<td width="34" align="right" bgcolor="#F4F6F8" style="background-color:#F4F6F8;padding:8px 10px;border:1px solid #E2E7EC;${FONT}font-size:12px;line-height:18px;font-weight:bold;color:#6B7787;text-transform:uppercase;letter-spacing:0.4px;">No.</td>
{{#each columns}}
<td bgcolor="#F4F6F8" style="background-color:#F4F6F8;padding:8px 10px;border:1px solid #E2E7EC;white-space:nowrap;${FONT}font-size:12px;line-height:18px;font-weight:bold;color:#6B7787;text-transform:uppercase;letter-spacing:0.4px;">{{this}}</td>
{{/each}}
{{#if timed}}
<td align="right" bgcolor="#F4F6F8" style="background-color:#F4F6F8;padding:8px 10px;border:1px solid #E2E7EC;white-space:nowrap;${FONT}font-size:12px;line-height:18px;font-weight:bold;color:#6B7787;text-transform:uppercase;letter-spacing:0.4px;">Days waiting</td>
{{/if}}
</tr>
{{#each rows}}
<tr>
<td align="right" valign="top" style="padding:8px 10px;border:1px solid #E2E7EC;${FONT}font-size:13px;line-height:19px;color:#1A2633;color:#6B7787;">{{no}}</td>
{{#each cells}}
<td valign="top" style="padding:8px 10px;border:1px solid #E2E7EC;{{#if nowrap}}white-space:nowrap;{{/if}}${FONT}font-size:13px;line-height:19px;color:#1A2633;">{{text}}</td>
{{/each}}
{{#if ../timed}}
<td align="right" valign="top" style="padding:8px 10px;border:1px solid #E2E7EC;white-space:nowrap;${FONT}font-size:13px;line-height:19px;color:#1A2633;">{{days}}</td>
{{/if}}
</tr>
{{/each}}
{{#if more}}
<tr><td colspan="{{span}}" style="padding:8px 10px;border:1px solid #E2E7EC;${FONT}font-size:13px;line-height:19px;color:#1A2633;color:#6B7787;">and {{more}} more, listed in LDMS</td></tr>
{{/if}}
</table>
${gap(12)}
{{> button href=href label=action}}
{{/each}}
${gap(24)}
<p style="margin:0;font-size:13px;line-height:20px;color:#6B7787;">{{closing}} If you have trouble signing in, contact Learning &amp; Development to reset your password.</p>
${gap(16)}
<p style="margin:0;"><strong>Thank you.</strong></p>
{{/layout}}`,

  /** L&D's test email: proves this server can send. */
  test: `{{#> layout}}
<p style="margin:0 0 12px;font-size:15px;"><strong>This is a test email from LDMS.</strong></p>
<p style="margin:0 0 12px;">It was sent by {{sentBy}} from the Jobs and email screen.</p>
<p style="margin:0;">If you can read it, this server can send email.</p>
{{/layout}}`,
} as const;

export type DigestData = {
  name: string;
  /** "8 things are waiting for you in LDMS." */
  summary: string;
  /** "You will get this email each day until these are done." */
  closing: string;
  sections: {
    heading: string;
    count: number;
    /** The table's headings between "No." and "Days waiting". */
    columns: string[];
    /** Whether the table has the "Days waiting" column. */
    timed: boolean;
    rows: { no: number; cells: { text: string; nowrap: boolean }[]; days: string }[];
    more: number;
    /** How many columns the table has in all. */
    span: number;
    href: string;
    action: string;
  }[];
};

type Data = { digest: DigestData; test: { sentBy: string } };

const compiled = Object.fromEntries(Object.entries(TEMPLATES).map(([name, source]) => [name, hb.compile(source)])) as { [K in keyof Data]: Handlebars.TemplateDelegate };

/** An email's whole HTML, from its template. `title` is the document's title; `preheader` the grey line mail programs show beside the subject. */
export function renderEmail<K extends keyof Data>(template: K, data: Data[K], title: string, preheader: string): string {
  return compiled[template]({ ...data, title, preheader });
}

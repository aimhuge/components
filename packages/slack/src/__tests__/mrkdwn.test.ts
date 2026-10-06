import { describe, expect, it } from "vitest";
import { clip, escSlack, markdownToMrkdwn, slackLink } from "../mrkdwn.js";

describe("markdownToMrkdwn", () => {
  it("turns markdown links into Slack links, label escaped, URL untouched", () => {
    expect(markdownToMrkdwn("Read [the <launch> post](https://x.co/a?b=1&c=2) now")).toBe(
      "Read <https://x.co/a?b=1&c=2|the &lt;launch&gt; post> now",
    );
  });

  it("bolds with one asterisk and strikes with one tilde", () => {
    expect(markdownToMrkdwn("**big** and __also__ and ~~gone~~")).toBe("*big* and *also* and ~gone~");
  });

  it("makes headings bold lines and bullets dots", () => {
    expect(markdownToMrkdwn("## What shipped\n- one\n* two")).toBe("*What shipped*\n• one\n• two");
  });

  it("escapes the three characters Slack reserves, once", () => {
    expect(markdownToMrkdwn("a < b & c > d")).toBe("a &lt; b &amp; c &gt; d");
  });

  it("leaves code fences alone apart from escaping", () => {
    expect(markdownToMrkdwn("```\n**not bold** <x>\n```")).toBe("```\n**not bold** &lt;x&gt;\n```");
  });
});

describe("helpers", () => {
  it("escSlack", () => expect(escSlack("<&>")).toBe("&lt;&amp;&gt;"));
  it("slackLink can't be cut short by a pipe in the label", () =>
    expect(slackLink("https://x.co", "a|b")).toBe("<https://x.co|a¦b>"));
  it("clip cuts on a word boundary when one is near", () =>
    expect(clip("alpha beta gamma delta", 15)).toBe("alpha beta…"));
  it("clip cuts mid-word rather than lose most of the text", () =>
    expect(clip("one two three four", 12)).toBe("one two thr…"));
  it("clip leaves short text alone", () => expect(clip("short", 12)).toBe("short"));
});

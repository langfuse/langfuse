"use client";
// @ts-ignore
import germanStrings from "react-timeago/lib/language-strings/de";
// @ts-ignore
import englishStrings from "react-timeago/lib/language-strings/en";
// @ts-ignore
import buildFormatter from "react-timeago/lib/formatters/buildFormatter";

import TimeAgo from "react-timeago";
type Props = { time: string; lang: Locale };
function LiveTimestamp({ time, lang }: Props) {
  const formatter =
    lang === "de"
      ? buildFormatter(germanStrings)
      : buildFormatter(englishStrings);
  return <TimeAgo formatter={formatter} date={time} />;
}

export default LiveTimestamp;

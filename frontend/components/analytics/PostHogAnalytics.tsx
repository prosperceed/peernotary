"use client";

import Script from "next/script";

export default function PostHogAnalytics() {
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
	if (!key) return null;

	return (
		<Script id="posthog-init" strategy="afterInteractive">
			{`!function(t,e){var o,n,p,r;e.__SV||((window.posthog=e),e._i=[],e.init=function(i,s,a){function g(t,e){var n=e.split(".");2==n.length&&(t=t[n[0]],e=n[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=document.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=document.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once people.unset people.increment people.append people.remove people.group register register_once unregister opt_out_capturing opt_in_capturing has_opted_out_capturing has_opted_in_capturing clear_opt_out_capturing debug reset get_distinct_id get_property getFeatureFlag onFeatureFlags reloadFeatureFlags getAllFlags get_session_id get_session_replay_url get_session_replay_properties get_session_replay_recording_properties get_session_replay_recording_properties get_session_replay_url get_session_id".split(" ");for(n=0;n<o.length;n++)g(u,o[n]);e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(key)},{api_host:${JSON.stringify(host)},capture_pageview:"history_change",persistence:"localStorage"});`}
		</Script>
	);
}

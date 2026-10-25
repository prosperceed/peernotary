"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
	target: number;
	prefix?: string;
	suffix?: string;
	duration?: number;
}

export default function AnimatedCounter({ target, prefix = "", suffix = "", duration = 1800 }: Props) {
	const [value, setValue] = useState(0);
	const spanRef = useRef<HTMLSpanElement>(null);
	const started = useRef(false);

	useEffect(() => {
		const el = spanRef.current;
		if (!el) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting && !started.current) {
					started.current = true;
					const start = performance.now();
					const tick = (now: number) => {
						const p = Math.min((now - start) / duration, 1);
						const eased = 1 - Math.pow(1 - p, 3);
						setValue(Math.round(eased * target));
						if (p < 1) requestAnimationFrame(tick);
					};
					requestAnimationFrame(tick);
				}
			},
			{ threshold: 0.5 },
		);

		observer.observe(el);
		return () => observer.disconnect();
	}, [target, duration]);

	return (
		<span ref={spanRef}>
			{prefix}{value.toLocaleString()}{suffix}
		</span>
	);
}

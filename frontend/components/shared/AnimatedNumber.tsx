"use client";

import { useEffect, useRef } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Counts up to `value` once it scrolls into view; re-animates when it changes. */
export default function AnimatedNumber({
	value,
	format,
	duration = 1.1,
	className,
}: {
	value: number;
	format: (n: number) => string;
	duration?: number;
	className?: string;
}) {
	const ref = useRef<HTMLSpanElement>(null);
	const from = useRef(0);
	const inView = useInView(ref, { once: true });
	const reduce = useReducedMotion();

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (reduce || !inView) {
			el.textContent = format(value);
			return;
		}
		const controls = animate(from.current, value, {
			duration,
			ease: [0.16, 1, 0.3, 1],
			onUpdate: (n) => {
				el.textContent = format(n);
			},
		});
		from.current = value;
		return () => controls.stop();
	}, [value, inView, reduce, duration, format]);

	return (
		<span ref={ref} className={className}>
			{format(value)}
		</span>
	);
}

var fingerprints = module.exports;

/**
 * Checks input string if it is in valid format, and returns it in human readbale format.
 * returns undefined if invalid format detected. Useful for checking user entered fingerprint
 * acceptable formats:
 * (5 segements of 8 chars each (case insensative)
 * white-space is ignored:
 * F88D5DFD BDB1C0A3 0D7543FF 2DF6F58C 28AE3F42 (human readable format)
 * f88d5dfdbdb1c0a30d7543ff2df6f58c28ae3f42 (how it is usually stored in fingerprints keystore file)
 */
fingerprints.human = function (str) {
	if (!str) return;

	var valid_segments = true;
	var segments = [];
	str.match(/(\s?\w+\s?)/ig).forEach(function (segment) {
		segments.push(segment.toUpperCase().trim());
	});

	if (segments.length == 5) {
		segments.forEach(function (seg) {
			if (!seg.match(/^[A-F0-9]{8}$/)) valid_segments = false;
		});

		if (valid_segments) return segments.join(" ");

	} else if (segments.length == 1) {
		if (!segments[0].match(/^[A-F0-9]{40}$/)) return;
		return segments[0].match(/([A-F0-9]{8})/g).join(" ");
	}

	return;
};

fingerprints.equal = function (a, b) {
	var ah = fingerprints.human(a);
	var ab = fingerprints.human(b);
	if (!ah || !ab) return false; //only compare valid fingerprints
	return (ah === ab);
};

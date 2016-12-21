document.addEventListener('DOMContentLoaded', function () {
	'use strict';
	if (window.location.search && window.history.replaceState) {
		window.history.replaceState({}, document.title, location.pathname);
	}
})

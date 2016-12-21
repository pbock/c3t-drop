'use strict';

document.addEventListener('DOMContentLoaded', function () {
	var filterField = document.getElementById('filter');
	var filterTargets = document.querySelectorAll('[data-filter-string]');
	if (!filterField) return;
	filterField.addEventListener('keyup', function () {
		var filterString = filterField.value.toLowerCase();
		var field;
		for (var i = 0; i < filterTargets.length; i++) {
			field = filterTargets[i];
			if (field.getAttribute('data-filter-string').toLowerCase().indexOf(filterString) !== -1) {
				field.style.display = 'block';
			} else {
				field.style.display = 'none';
			}
		}
	})
})

<script>

	/**
	 * @typedef {Object} Hints
	 * @property {string} name Name of the hint
	 * @property {string} description Description of the hint
	 * @property {string} [action] Action string, with {selection} as a placeholder for selected text
	 * @property {string} [placeholder] Placeholder text to insert if no text is selected
	 * @property {string[]} [examples] Example usages of the hint
	*/


	/**
	 * @typedef {Object} Props
	 * @property {string} [searchString] The current search string
	 * @property {Hints[]} [hints] List of hints to show in the hints panel
	 * @property {string} [placeholder] Placeholder text for the input field
	*/



	/** @type {Props}*/
	let { searchString = $bindable(), hints, placeholder = "Search..." } = $props();

	let inputText = $state(searchString || '');

	let showHints = $state(false);
	/** @type {HTMLDivElement | null} */
	let containerEl = null;
	/** @type {HTMLInputElement | null} */
	let inputEl = null;


	// Debounce changes to inputText
	/** @type {number} */
	let debounceTimeout;
	$effect(() => {
		inputText = inputText;
		clearTimeout(debounceTimeout);
		debounceTimeout = setTimeout(() => {
			searchString = inputText;
		}, 100);
	});

	// Close hints when clicking outside of the component
	$effect(() => {
		if (!showHints) return;
		/** @param {MouseEvent} e */
		function handleOutside(e) {
			if (containerEl && !containerEl.contains(/** @type {Node} */ (e.target))) {
				showHints = false;
			}
		}
		document.addEventListener('mousedown', handleOutside, true);
		return () => document.removeEventListener('mousedown', handleOutside, true);
	});

	/**
	 * Appends an action string to the end of the input, replacing {selection}
	 * and selects the inserted placeholder substring.
	 * @param {string} actionTemplate
	 * @param {string} placeholder
	 */
	function applyHint(actionTemplate, placeholder) {
		const action = actionTemplate.replaceAll('{selection}', placeholder);
		if (!inputEl) {
			inputText = (inputText || '') + action;
			return;
		}

        // Place caret at end and insert to preserve undo stack
		const beforeLen = inputEl.value.length;
		inputEl.focus();
		inputEl.setSelectionRange(beforeLen, beforeLen);

        let actionText = action;
        // If the last character is a space (token delimiter), we add a space before the action string
        if(inputEl.value.length > 0 && !/\s$/.test(inputEl.value)) actionText = " " + actionText;
		document.execCommand('insertText', false, actionText);

        // Ensure bound value stays in sync
		// Select the placeholder portion if present
		const relStart = actionText.indexOf(placeholder);
		if (relStart >= 0) {
			const start = beforeLen + relStart;
			const end = start + placeholder.length;
			setTimeout(() => inputEl && inputEl.setSelectionRange(start, end));
		} else {
			setTimeout(() => inputEl && inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length));
		}
	}

    /**
     * Inserts quotes around the selected text in the input element.
     * @param {HTMLInputElement} inputElement
     */
    function insertQuotes(inputElement) {
        const { selectionStart, selectionEnd } = inputElement;
        if(selectionStart === null || selectionEnd === null) return;

        // Use document.execCommand to preserve undo
        const selectedText = inputText.substring(selectionStart, selectionEnd);
        document.execCommand('insertText', false, `\"${selectedText}\"`);

        setTimeout(() => {
            inputElement.setSelectionRange(selectionStart + 1, selectionEnd + 1);
        });
    }

	/** @param {KeyboardEvent} event */
	function onKeyDown(event) {
		if (event.key === '\"') {
			const inputElement = /** @type {HTMLInputElement} */ (event.currentTarget);
			// If there is a selection, add quotes around it
			const { selectionStart, selectionEnd } = inputElement;
			if (selectionStart !== selectionEnd) {
				insertQuotes(inputElement);
				event.preventDefault();
			}
		}
	}
</script>

<div class="omnibox" bind:this={containerEl}>
	<!-- svelte-ignore a11y_autofocus -->
	<input
		type="search"
		bind:value={inputText}
		onkeydown={onKeyDown}
		{placeholder}
		autocomplete="off"
		spellcheck="false"
		onfocus={(event) => event.currentTarget.select()}
		autofocus
		class:has-hints={!!hints?.length}
		bind:this={inputEl}
	/>
	{#if hints?.length}
		<button class="hints" onclick={() => (showHints = !showHints)}>Hints</button>
	{/if}

	{#if showHints}
		<div class="hints-panel" role="dialog" aria-label="Search hints">
			{#each hints as hint}
				<div class="hint-item">
					<div class="hint-text">
						<strong>{hint.name}</strong>
						<div class="hint-desc">{hint.description}
							{#if hint.examples}
                            <br />
                            e.g. {#each hint.examples as example, i (example)}
                            	<code>{example}</code>{i < hint.examples.length - 1 ? ', ' : ''}
                        	{/each}
							{/if}
                        </div>
                        
					</div>
					{#if hint.action}
						<button class="hint-apply" title={hint.action} onclick={() => applyHint(hint.action, hint.placeholder)}>
							Insert
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.omnibox {
		display: flex;
		flex-flow: row nowrap;
		gap: 1px;
		position: relative;

		--border-radius: 4px;
	}

	input[type='search'] {
		padding: 8px;
		border: 1px solid var(--border, #999);
		border-radius: var(--border-radius);

		&.has-hints {
			border-radius: var(--border-radius) 0 0 var(--border-radius);
			border-inline-end: 0;
		}

		font-size: 1.2rem;

        flex-grow: 1;
	}

    button.hints {
		border-radius: 0 var(--border-radius) var(--border-radius) 0;
		border: 1px solid var(--border);
		border-inline-start: 0;
		background: var(--input-bg);
		color: var(--text);
		cursor: pointer;

		&:hover {
			background: var(--input-bg-hover);
		}
		&:active {
			background: var(--input-bg-active);
		}
    }

	.hints-panel {
		position: absolute;
		top: 100%;
		right: 0;
		margin-top: 2px;
		max-width: 30vw;
		background: var(--bg);
		color: var(--text, inherit);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 6px 24px rgba(0,0,0,0.3);
		padding: 8px;
		z-index: 10;
	}

	.hint-item {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		padding: 6px 4px;
		border-radius: 4px;
	}

	.hint-text {
		flex: 1 1 auto;
		min-width: 0;
	}

	.hint-desc {
		font-size: 0.9rem;
		opacity: 0.85;
	}

	.hint-apply {
		white-space: nowrap;
        padding: 4px 8px;
	}

    code {
        background-color: var(--input-bg);
    }
</style>

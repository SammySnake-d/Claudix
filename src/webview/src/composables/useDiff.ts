import { ref, watch, computed } from 'vue';

export function useDiff(props: any) {
  const structuredPatch = ref<any>(null);

  watch(
    () => [props.toolUseResult, props.toolUse, props.toolResult],
    () => {
      // If there is an error, do not display the diff
      if (props.toolResult?.is_error) {
        structuredPatch.value = null;
        return;
      }

      // Prioritize using structuredPatch from toolUseResult (actual diff returned after execution)
      if (props.toolUseResult?.structuredPatch) {
        structuredPatch.value = props.toolUseResult.structuredPatch;
      }
      // If there is input, generate a temporary diff (permission request phase or keep after real-time conversation execution)
      else if (props.toolUse?.input?.old_string && props.toolUse?.input?.new_string) {
        structuredPatch.value = generatePatchFromInput(
          props.toolUse.input.old_string,
          props.toolUse.input.new_string
        );
      } else {
        structuredPatch.value = null;
      }
    },
    { immediate: true, deep: true }
  );

  const processedPatches = computed(() => {
    if (!structuredPatch.value) return [];

    return structuredPatch.value.map((patch: any) => {
      let oldLineCounter = patch.oldStart;
      let newLineCounter = patch.newStart;

      const lines = patch.lines.map((lineContent: string) => {
        let displayLineNumber: string;

        if (lineContent.startsWith('-')) {
          displayLineNumber = String(oldLineCounter);
          oldLineCounter++;
        } else if (lineContent.startsWith('+')) {
          displayLineNumber = String(newLineCounter);
          newLineCounter++;
        } else {
          // For context lines, the original implementation displays the new line number
          displayLineNumber = String(newLineCounter);
          oldLineCounter++;
          newLineCounter++;
        }

        return {
          content: lineContent,
          displayLineNumber,
          class: getDiffLineClass(lineContent),
          prefix: getLinePrefix(lineContent),
          contentWithoutPrefix: getLineContent(lineContent),
        };
      });

      return {
        ...patch,
        lines,
      };
    });
  });

  const hasDiffView = computed(() => {
    return processedPatches.value && processedPatches.value.length > 0;
  });

  const diffStats = computed(() => {
    if (!structuredPatch.value) return null;

    let added = 0;
    let removed = 0;

    structuredPatch.value.forEach((patch: any) => {
      patch.lines.forEach((line: string) => {
        if (line.startsWith('+')) added++;
        if (line.startsWith('-')) removed++;
      });
    });

    return { added, removed };
  });

  function generatePatchFromInput(oldStr: string, newStr: string): any[] {
    const oldLines = oldStr.split('\n');
    const newLines = newStr.split('\n');

    const lines: string[] = [];

    oldLines.forEach(line => {
      lines.push('-' + line);
    });

    newLines.forEach(line => {
      lines.push('+' + line);
    });

    return [{
      oldStart: 1,
      oldLines: oldLines.length,
      newStart: 1,
      newLines: newLines.length,
      lines
    }];
  }

  function getDiffLineClass(line: string): string {
    if (line.startsWith('-')) return 'diff-line-delete';
    if (line.startsWith('+')) return 'diff-line-add';
    return 'diff-line-context';
  }

  function getLinePrefix(line: string): string {
    if (line.startsWith('-') || line.startsWith('+')) {
      return line[0];
    }
    return ' ';
  }

  function getLineContent(line: string): string {
    if (line.startsWith('-') || line.startsWith('+')) {
      return line.substring(1);
    }
    return line;
  }

  return {
    processedPatches,
    hasDiffView,
    diffStats,
  };
}

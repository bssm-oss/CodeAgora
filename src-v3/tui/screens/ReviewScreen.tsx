import React from 'react';
import { Box, Text } from 'ink';

interface ReviewScreenProps {
  diffPath?: string;
}

export function ReviewScreen({ diffPath }: ReviewScreenProps): React.JSX.Element {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Review Pipeline</Text>
      <Box marginTop={1}>
        <Text>Starting review...</Text>
      </Box>
      {diffPath ? (
        <Box marginTop={1}>
          <Text>Diff: <Text color="cyan">{diffPath}</Text></Text>
        </Box>
      ) : null}
    </Box>
  );
}

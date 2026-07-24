# Page composition

```tsx
import { Button, Container, PageHeader, Section, Stack, TextField } from "@test4test/design-system";

export function ExamplePage() {
  return (
    <Section>
      <Container size="form">
        <Stack gap="lg">
          <PageHeader title="Submit a test" description="Describe what testers should evaluate." />
          <TextField label="Test name" name="name" />
          <Button type="submit">Continue</Button>
        </Stack>
      </Container>
    </Section>
  );
}
```

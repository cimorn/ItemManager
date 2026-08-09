import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import NodeEditorPane from '../../src/renderer/features/catalog/NodeEditorPane';

const node = { id: 'cat_1', name: '旧分类', level: 1, parentId: null };

describe('NodeEditorPane IME input', () => {
  it('keeps composing text locally and commits the name only after confirmation', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<NodeEditorPane mode="category" entries={[node]} node={node} onUpdate={onUpdate} />);

    const input = screen.getByLabelText('名称');

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '衣' } });

    expect(input).toHaveValue('衣');
    expect(onUpdate).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { target: { value: '衣服' } });

    expect(input).toHaveValue('衣服');
    expect(onUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '确定' }));

    expect(onUpdate).toHaveBeenCalledWith('category', 'cat_1', { name: '衣服' });
  });
});

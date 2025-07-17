import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { HelloWorld } from '../src/index'

describe('HelloWorld', () => {
  test('renders hello world message', async () => {
    render(<HelloWorld />)

    // Check that the main heading is present
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toBeInTheDocument()
    expect(heading).toHaveTextContent('Hello World! 👋')
  })

  test('renders welcome message', async () => {
    render(<HelloWorld />)

    // Check that the welcome message is present
    const welcomeMessage = screen.getByText('Welcome to the Jotai Iframe Bridge library')
    expect(welcomeMessage).toBeInTheDocument()
  })

  test('has correct styling', async () => {
    render(<HelloWorld />)

    // Check that the container has the expected background color
    const container = screen.getByText('Hello World! 👋').closest('div')
    expect(container).toHaveStyle({
      backgroundColor: '#f0f8ff',
      padding: '20px',
      borderRadius: '8px',
    })
  })

  test('heading has correct color', async () => {
    render(<HelloWorld />)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveStyle({
      color: '#4169e1',
    })
  })
})

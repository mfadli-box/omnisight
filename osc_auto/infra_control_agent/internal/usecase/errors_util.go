package usecase

import "errors"

// errorsNew — alias ringkas.
func errorsNew(msg string) error { return errors.New(msg) }

//go:build !production

package logging

import "io"

func Setup() (io.Closer, error) {
	return nil, nil
}

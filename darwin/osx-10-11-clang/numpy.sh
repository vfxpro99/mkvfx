#! /bin/sh

if [ ! -f local/include/numpy/_numpyconfig.h ]; then

  if [ ! -f prereq ]; then
    mkdir -p prereq
  fi
  if [ ! -f local/lib ]; then
    mkdir -p local/lib
  fi
  if [ ! -f local/bin ]; then
    mkdir -p local/bin
  fi
  if [ ! -f local/include ]; then
    mkdir -p local/include
  fi

  # early sudo so the build isn't interrupted in the middle waiting for a password
  ROOT=$(pwd)
  sudo cd prereq

  curl -L -o Cython.tgz http://cython.org/release/Cython-0.23.4.tar.gz
  tar -zxf Cython.tgz
  cd Cython-0.23.4
  sudo python setup.py install
  if [ ! -f numpy/.git/config ]; then
    git clone git://github.com/numpy/numpy.git
  else
    cd numpy; git pull; cd ..
  fi
  cd numpy
  python setup.py build
  sudo python setup.py install
  cp -R numpy/core/include/numpy ${ROOT}/local/include
  cp -R build/src.macosx-*-intel-2.7/numpy/core/include/numpy ${ROOT}/local/include
  cd ${ROOT}
fi

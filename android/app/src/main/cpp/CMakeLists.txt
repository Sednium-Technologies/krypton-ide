cmake_minimum_required(VERSION 3.22.1)

project("krypton-native" LANGUAGES C CXX)

add_library(
    krypton-pty
    SHARED
    pty_bridge.c
)

find_library(log-lib log)

target_link_libraries(
    krypton-pty
    ${log-lib}
)

add_library(
    oorty_engine
    SHARED
    oorty_engine.cpp
)

target_link_libraries(
    oorty_engine
    ${log-lib}
)
